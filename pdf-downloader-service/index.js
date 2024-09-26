import path from 'path';
import dotenv from 'dotenv';
import amqp from 'amqplib';
import axios from 'axios';
import { Client as Minio } from 'minio';
import fs from 'fs';
import mongoose from 'mongoose';
import winston from 'winston';
const { combine, timestamp, printf, json, colorize } = winston.format;
import { ElasticsearchTransport } from 'winston-elasticsearch';
import { Client } from '@elastic/elasticsearch';
import { nanoid } from 'nanoid';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import LogEntry from "./models/logEntry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../.env') });

const minioClient = new Minio({
  endPoint: process.env.MINIO_ENDPOINT,
  port: parseInt(process.env.MINIO_PORT, 10),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});

const QUEUE = process.env.RABBITMQ_QUEUE;
const LOCAL_FOLDER = process.env.LOCAL_FOLDER;
const BUCKET_NAME = process.env.MINIO_BUCKET_NAME;

const esClient = new Client({ node: process.env.ELASTICSEARCH_URL});

const esTransportOpts = {
  level: "info",
  client: esClient,
  indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX,
  transformer: (logData) => {
    return {
      "@timestamp": logData.timestamp || new Date().toISOString(),
      message: logData.message,
      severity: logData.level,
      meta: logData.meta || {},
    };
  },
};
const esTransport = new ElasticsearchTransport(esTransportOpts);

if (!fs.existsSync(LOCAL_FOLDER)) {
  fs.mkdirSync(LOCAL_FOLDER);
  console.log(`Folder '${LOCAL_FOLDER}' created.`);
}

// Custom format for console logs
const consoleFormat = combine(
  colorize(),
  timestamp(),
  printf(({ timestamp, level, message, ...meta }) => {
    let metaString = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : "";
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

// Custom format for file logs
const fileFormat = combine(
  timestamp(),
  printf(({ timestamp, level, message, ...meta }) => {
    let metaString = Object.keys(meta).length
      ? JSON.stringify(meta, null, 2)
      : "";
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

const logger = winston.createLogger({
  level: "info",
  format: json(),
  transports: [
    new winston.transports.File({
      filename: "logs/combined.log",
      format: fileFormat,
    }),
    new winston.transports.Console({ format: consoleFormat }),
    esTransport, // Elasticsearch transport
  ],
});

mongoose
  .connect(process.env.MONGODB_URL)
  .then(() => logger.info("Connected to MongoDB"))
  .catch((err) => {
    logger.error("Failed to connect to MongoDB", { error: err.message });
    process.exit(1);
  });

async function initialize() {
  try {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    if (!bucketExists) {
      await minioClient.makeBucket(BUCKET_NAME);
      logger.info(`Bucket '${BUCKET_NAME}' created.`);
    } else {
      logger.info(`Bucket '${BUCKET_NAME}' already exists.`);
    }
  } catch (error) {
    logger.error(`Error initializing bucket: ${error.message}`);
    process.exit(1);
  }
}

async function generateUniqueFilename(destination) {
  const dateTime = new Date()
    .toISOString()
    .replace(/[-:.T]/g, "")
    .slice(0, 14);
  const nanoId = nanoid(5).toUpperCase();
  return `${dateTime}${nanoId}.pdf`;
}

async function downloadPdf(url, destination, channel, attempts = 5) {
  let filename = "";
  let fileSize = 0;
  let status = "success";

  const downloadStartTime = new Date(); // Start time for download
  let downloadEndTime; // End time for download
  let saveStartTime; // Start time for saving
  let saveEndTime; // End time for saving

  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    fileSize = buffer.length;
    downloadEndTime = new Date(); // End time for download

    filename = await generateUniqueFilename(destination);
    saveStartTime = new Date(); // Start time for saving

    if (destination === "minio") {
      await minioClient.putObject(BUCKET_NAME, filename, buffer);
      logger.info(`Successfully saved ${filename} to Minio.`);
    } else if (destination === "local") {
      const filePath = path.join(LOCAL_FOLDER, filename);
      fs.writeFileSync(filePath, buffer);
      logger.info(
        `Successfully saved ${filename} to local folder '${LOCAL_FOLDER}'.`
      );
    } else {
      throw new Error(`Invalid destination: ${destination}`);
    }
    saveEndTime = new Date(); // End time for saving
  } catch (error) {
    status = "failed";
    logger.error(
      `Error downloading or saving PDF from ${url}: ${error.message}`
    );

    if (attempts > 1) {
      await channel.sendToQueue(
        QUEUE,
        Buffer.from(JSON.stringify({ url, attempts: attempts - 1 }))
      );
      logger.info(`Requeued URL ${url} for attempt ${6 - attempts}`);
    } else {
      logger.error(`Max attempts reached for URL ${url}. No more retries.`);
    }
  } finally {
    let downloadDuration = downloadEndTime - downloadStartTime;
    let saveDuration = saveEndTime - saveStartTime;

    if (isNaN(downloadDuration)) {
      downloadDuration = 0;
    }

    if (isNaN(saveDuration)) {
      saveDuration = 0;
    }

    // Save log entry to MongoDB
    const logEntry = new LogEntry({
      url,
      filename,
      destination,
      downloadStartTime,
      downloadEndTime,
      saveStartTime,
      saveEndTime,
      downloadDuration,
      saveDuration,
      status,
      fileSize,
    });
    await logEntry.save();

    // Log to winston
    logger.info(`Processed URL ${url}`, {
      url,
      filename,
      destination,
      downloadDuration,
      saveDuration,
      status,
      fileSize,
    });
  }
}

let rabbitMQConnection;

async function connectToRabbitMQ(retries = 10) {
  while (retries) {
    try {
      const connection = await amqp.connect(process.env.RABBITMQ_URL);
      logger.info("Connected to RabbitMQ");
      return connection;
    } catch (err) {
      logger.error("Failed to connect to RabbitMQ:", err.message);
      retries -= 1;
      logger.info(`Retries left: ${retries}`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
  throw new Error("Failed to connect to RabbitMQ after multiple retries.");
}

async function consumeMessages(destination = "minio") {
  const connection = rabbitMQConnection || await connectToRabbitMQ();
  rabbitMQConnection = connection;
  
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE);

  channel.prefetch(1);

  channel.consume(QUEUE, async (msg) => {
    if (msg !== null) {
      const { url, attempts = 5 } = JSON.parse(msg.content.toString());

      await downloadPdf(url, destination, channel, attempts);

      channel.ack(msg);
    }
  });
}

initialize()
  .then(() => consumeMessages().catch(logger.error))
  .catch(logger.error);
