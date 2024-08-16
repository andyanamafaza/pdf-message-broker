const amqp = require("amqplib");
const axios = require("axios");
const Minio = require("minio");
const stream = require("stream");

const minioClient = new Minio.Client({
  endPoint: "minio",
  port: 9000,
  useSSL: false,
  accessKey: "admin",
  secretKey: "admin",
});

const QUEUE = "pdf_queue";

async function downloadPdf(url, filename) {
  try {
    console.log(`Downloading PDF from: ${url}`);
    const response = await axios.get(url, { responseType: "stream" });

    const bucketName = "pdfs";

    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, "us-east-1");
      console.log(`Bucket '${bucketName}' created.`);
    }

    const passthrough = new stream.PassThrough();
    response.data.pipe(passthrough);

    await minioClient.putObject(bucketName, filename, passthrough, (err) => {
      if (err) {
        console.error(`Failed to save ${filename} to Minio:`, err);
        throw err;
      }
      console.log(`Successfully saved ${filename} to Minio.`);
    });
  } catch (error) {
    console.error(`Error downloading PDF from ${url}:`, error);
  }
}

async function consumeMessages() {
  const connection = await connectToRabbitMQ();
  const channel = await connection.createChannel();

  await channel.assertQueue(QUEUE);

  channel.consume(QUEUE, async (msg) => {
    if (msg !== null) {
      const { urls } = JSON.parse(msg.content.toString());
      for (let url of urls) {
        const filename = url.split("/").pop();
        await downloadPdf(url, filename);
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

consumeMessages().catch(console.error);
