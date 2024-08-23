const amqp = require("amqplib");
const axios = require("axios");
const Minio = require("minio");
const fs = require('fs');
const path = require('path');
const mongoose = require("mongoose");
const winston = require("winston");
const LogEntry = require("./models/logEntry.js");

const minioClient = new Minio.Client({
  endPoint: "minio",
  port: 9000,
  useSSL: false,
  accessKey: "adminadminadmin",
  secretKey: "adminadminadmin",
});

const QUEUE = "pdf_queue";
const LOCAL_FOLDER = 'savedPdfTest';
const BUCKET_NAME = "pdfs";

if (!fs.existsSync(LOCAL_FOLDER)) {
  fs.mkdirSync(LOCAL_FOLDER);
  console.log(`Folder '${LOCAL_FOLDER}' created.`);
}

const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "logs/combined.log" }),
    new winston.transports.Console(),
  ],
});

mongoose.connect("mongodb://mongodb:27017/pdfdownloadservice")
  .then(() => logger.info("Connected to MongoDB"))
  .catch(err => logger.error("Failed to connect to MongoDB", { error: err.message }));

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
  const { nanoid } = await import('nanoid');
  const dateTime = new Date().toISOString().replace(/[-:.T]/g, '').slice(0, 14);
  const nanoId = nanoid(5).toUpperCase();
  return `${dateTime}${nanoId}.pdf`;
}

async function downloadPdf(url, destination, channel) {
  const startTime = new Date();
  let filename = "";
  let fileSize = 0;
  let status = "success";

  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    fileSize = buffer.length;

    filename = await generateUniqueFilename(destination); 
    if (destination === 'minio') {
      await minioClient.putObject(BUCKET_NAME, filename, buffer);
      logger.info(`Successfully saved ${filename} to Minio.`);
    } else if (destination === 'local') {
      const filePath = path.join(LOCAL_FOLDER, filename);
      fs.writeFileSync(filePath, buffer);
      logger.info(`Successfully saved ${filename} to local folder '${LOCAL_FOLDER}'.`);
    } else {
      throw new Error(`Invalid destination: ${destination}`);
    }

  } catch (error) {
    status = "failed";
    logger.error(`Error downloading or saving PDF from ${url}: ${error.message}`);
    // Re-queue the URL for another attempt
    await channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify({ url })));
    logger.info(`Requeued URL ${url} due to error`);
  } finally {
    const endTime = new Date();
    const duration = endTime - startTime;

    // Save log entry to MongoDB
    const logEntry = new LogEntry({
      url,
      filename,
      destination,
      startTime,
      endTime,
      duration,
      status,
      fileSize,
    });
    await logEntry.save();

    // Log to winston
    logger.info(`Processed URL ${url}`, {
      url,
      filename,
      destination,
      duration,
      status,
      fileSize,
    });
  }
}

async function consumeMessages(destination = 'minio') {
  const connection = await connectToRabbitMQ();
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE);

  channel.consume(QUEUE, async (msg) => {
    if (msg !== null) {
      const { url } = JSON.parse(msg.content.toString());

      await downloadPdf(url, destination, channel);

      channel.ack(msg);
    }
  });
}

async function connectToRabbitMQ(retries = 5) {
  while (retries) {
    try {
      const connection = await amqp.connect("amqp://rabbitmq");
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

initialize()
  .then(() => consumeMessages().catch(logger.error))
  .catch(logger.error);
