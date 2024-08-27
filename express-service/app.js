const express = require("express");
const amqp = require("amqplib");
const morgan = require("morgan");
const mongoose = require("mongoose");
const winston = require("winston");
const LogEntry = require("./models/logEntry.js");

const app = express();
const PORT = 3000;

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format for console logs
const consoleFormat = combine(
  colorize(),
  timestamp(),
  printf(({ timestamp, level, message, ...meta }) => {
    let metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

// Custom format for file logs
const fileFormat = combine(
  timestamp(),
  printf(({ timestamp, level, message, ...meta }) => {
    let metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level}]: ${message} ${metaString}`;
  })
);

const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.File({ filename: "logs/express-service.log", format: fileFormat }),
    new winston.transports.Console({ format: consoleFormat }),
  ],
});

app.use(morgan((tokens, req, res) => {
  return `HTTP ${tokens.status(req, res)}`;
}, { stream: { write: (message) => logger.info(message.trim()) } }));

app.use(express.json());

mongoose.connect("mongodb://mongodb:27017/pdfdownloadservice")
  .then(() => logger.info("Connected to MongoDB"))
  .catch(err => logger.error("Failed to connect to MongoDB", { error: err.message }));

app.get("/status", async (req, res) => {
  try {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    const totalRequests = await LogEntry.countDocuments();
    const successfulRequests = await LogEntry.countDocuments({ status: "success" });

    const lastTenMinutes = await LogEntry.find({ 
      startTime: { $gte: tenMinutesAgo },
      status: "success"
    });

    const lastTenDownloads = await LogEntry.find({ status: "success" })
      .sort({ createdAt: -1 })
      .limit(10);

    const formatDuration = (ms) => {
      const minutes = Math.floor(ms / 60000);
      const seconds = ((ms % 60000) / 1000).toFixed(2);
      return minutes > 0 
        ? `${minutes} minutes and ${seconds} seconds`
        : `${seconds} seconds`;
    };

    const formatFileSize = (bytes) => {
      return bytes >= 1048576 
        ? `${(bytes / 1048576).toFixed(2)} MB`
        : `${bytes} bytes`;
    };

    const avgDownloadTimeLast10Min = lastTenMinutes.length > 0
      ? lastTenMinutes.reduce((acc, entry) => acc + entry.duration, 0) / lastTenMinutes.length
      : 0;

    const avgDownloadTimeLast10Downloads = lastTenDownloads.length > 0
      ? lastTenDownloads.reduce((acc, entry) => acc + entry.duration, 0) / lastTenDownloads.length
      : 0;

    const fastestDownload = await LogEntry.findOne({ status: "success" }).sort({ duration: 1 });
    const slowestDownload = await LogEntry.findOne({ status: "success" }).sort({ duration: -1 });
    const smallestDownload = await LogEntry.findOne({ status: "success", fileSize: { $gt: 0 } }).sort({ fileSize: 1 });
    const biggestDownload = await LogEntry.findOne({ status: "success" }).sort({ fileSize: -1 });

    res.json({
      totalRequests,
      successfulRequests,
      avgDownloadTimeLast10Min: formatDuration(avgDownloadTimeLast10Min),
      avgDownloadTimeLast10Downloads: formatDuration(avgDownloadTimeLast10Downloads),
      fastestDownload: formatDuration(fastestDownload?.duration || 0),
      slowestDownload: formatDuration(slowestDownload?.duration || 0),
      biggestDownload: formatFileSize(biggestDownload?.fileSize || 0),
      smallestDownload: formatFileSize(smallestDownload?.fileSize || 0),
    });
  } catch (error) {
    logger.error("Failed to retrieve status", { error: error.message });
    res.status(500).json({ error: "Failed to retrieve status" });
  }
});

async function sendToQueue(url) {
  try {
    const connection = await amqp.connect("amqp://rabbitmq");
    const channel = await connection.createChannel();
    await channel.assertQueue("pdf_queue");
    channel.sendToQueue("pdf_queue", Buffer.from(JSON.stringify({ url })));
    logger.info("Successfully sent to queue", { url });
    await channel.close(); // Close the channel after each message
    await connection.close(); // Close the connection after each message
  } catch (error) {
    logger.error("Failed to send to queue", { error: error.message, url });
    throw new Error("Failed to process request");
  }
}

app.post("/download", async (req, res) => {
  const { urls } = req.body;
  if (urls && urls.length) {
    try {
      for (const url of urls) {
        await sendToQueue(url); // Queue each URL separately
      }
      res.status(200).send("Request received");
      logger.info("Request received and processed", { urls });
    } catch (error) {
      res.status(500).send("Internal Server Error");
      logger.error("Error processing download request", { error: error.message, urls });
    }
  } else {
    res.status(400).send("No URLs provided");
    logger.warn("No URLs provided in the request", { urls });
  }
});

app.listen(PORT, () => {
  logger.info(`Express service running on http://localhost:${PORT}`);
});
