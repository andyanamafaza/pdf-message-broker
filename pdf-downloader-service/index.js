const amqp = require("amqplib");
const axios = require("axios");
const Minio = require("minio");
const fs = require('fs');
const path = require('path');

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

async function initialize() {
  try {
    const bucketExists = await minioClient.bucketExists(BUCKET_NAME);
    if (!bucketExists) {
      await minioClient.makeBucket(BUCKET_NAME, "us-east-1");
      console.log(`Bucket '${BUCKET_NAME}' created.`);
    } else {
      console.log(`Bucket '${BUCKET_NAME}' already exists.`);
    }
  } catch (error) {
    console.error(`Error initializing bucket: ${error}`);
    process.exit(1); 
  }
}

async function downloadPdf(url, destination) {
  try {
    const filename = path.basename(url);
    console.log(`Downloading PDF from: ${url}`);

    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);

    if (destination === 'minio') {
      const uniqueFilename = await generateUniqueFilename(filename, 'minio');
      await minioClient.putObject(BUCKET_NAME, uniqueFilename, buffer);
      console.log(`Successfully saved ${uniqueFilename} to Minio.`);
    } else if (destination === 'local') {
      const uniqueFilename = await generateUniqueFilename(filename, 'local');
      const filePath = path.join(LOCAL_FOLDER, uniqueFilename);
      fs.writeFileSync(filePath, buffer);
      console.log(`Successfully saved ${uniqueFilename} to local folder '${LOCAL_FOLDER}'.`);
    } else {
      throw new Error(`Invalid destination: ${destination}`);
    }

  } catch (error) {
    console.error(`Error downloading or saving PDF from ${url}:`, error);
  }
}

async function generateUniqueFilename(baseFilename, destination) {
  let uniqueFilename = baseFilename;
  let counter = 1;

  if (destination === 'minio') {
    while (true) {
      try {
        await minioClient.statObject(BUCKET_NAME, uniqueFilename);
        uniqueFilename = `${path.basename(baseFilename, path.extname(baseFilename))}(${counter++})${path.extname(baseFilename)}`;
      } catch (err) {
        if (err.code === "NotFound") {
          return uniqueFilename;
        }
        throw err;
      }
    }
  } else if (destination === 'local') {
    let filePath = path.join(LOCAL_FOLDER, uniqueFilename);
    while (fs.existsSync(filePath)) {
      uniqueFilename = `${path.basename(baseFilename, path.extname(baseFilename))}(${counter++})${path.extname(baseFilename)}`;
      filePath = path.join(LOCAL_FOLDER, uniqueFilename);
    }
    return uniqueFilename;
  } else {
    throw new Error(`Invalid destination: ${destination}`);
  }
}

async function consumeMessages(urlBatchSize = 3, destination = 'minio') {
  const connection = await connectToRabbitMQ();
  const channel = await connection.createChannel();
  await channel.assertQueue(QUEUE);

  channel.consume(QUEUE, async (msg) => {
    if (msg !== null) {
      const { urls } = JSON.parse(msg.content.toString());

      for (let i = 0; i < urls.length; i += urlBatchSize) {
        const urlBatch = urls.slice(i, i + urlBatchSize);
        await Promise.all(urlBatch.map(url => downloadPdf(url, destination)));
      }

      channel.ack(msg);
    }
  });
}

async function connectToRabbitMQ(retries = 5) {
  while (retries) {
    try {
      const connection = await amqp.connect("amqp://rabbitmq");
      console.log("Connected to RabbitMQ");
      return connection;
    } catch (err) {
      console.error("Failed to connect to RabbitMQ:", err);
      retries -= 1;
      console.log(`Retries left: ${retries}`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }
  throw new Error("Failed to connect to RabbitMQ after multiple retries.");
}

initialize()
  .then(() => consumeMessages().catch(console.error))
  .catch(console.error);
