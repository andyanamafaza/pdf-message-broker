const amqp = require("amqplib");
const axios = require("axios");
const Minio = require("minio");
const fs = require('fs');
const path = require('path');
const stream = require("stream");

const minioClient = new Minio.Client({
  endPoint: "minio",
  port: 9000,
  useSSL: false,
  accessKey: "adminadminadmin",
  secretKey: "adminadminadmin",
});

const QUEUE = "pdf_queue";

async function downloadPdf(url, filename) {
  try {
    console.log(`Downloading PDF from: ${url}`);
    const response = await axios.get(url, { responseType: "stream" });

    const bucketName = "pdfs";

    const generateUniqueFilename = async (baseFilename) => {
      let uniqueFilename = baseFilename;
      let counter = 1;

      while (true) {
        try {
          await minioClient.statObject(bucketName, uniqueFilename);
          uniqueFilename = `${path.basename(baseFilename, path.extname(baseFilename))}(${counter++})${path.extname(baseFilename)}`;
        } catch (err) {
          if (err.code === 'NotFound') {
            return uniqueFilename;
          }
          throw err;
        }
      }
    };

    const uniqueFilename = await generateUniqueFilename(filename);

    const passthrough = new stream.PassThrough();
    response.data.pipe(passthrough);

    await minioClient.putObject(bucketName, uniqueFilename, passthrough, (err) => {
      if (err) {
        console.error(`Failed to save ${uniqueFilename} to Minio:`, err);
        throw err;
      }
      console.log(`Successfully saved ${uniqueFilename} to Minio.`);
    });
  } catch (error) {
    console.error(`Error downloading PDF from ${url}:`, error);
  }
}

// async function downloadPdfToLocalFolder(url, filename) {
//   try {
//     console.log(`Downloading PDF from: ${url} to local folder.`);
//     const response = await axios.get(url, { responseType: "stream" });

//     const localFolder = 'savedPdfTest';

//     if (!fs.existsSync(localFolder)) {
//       fs.mkdirSync(localFolder);
//       console.log(`Folder '${localFolder}' created.`);
//     }

//     const filePath = path.join(localFolder, filename);
//     const writeStream = fs.createWriteStream(filePath);

//     response.data.pipe(writeStream);

//     return new Promise((resolve, reject) => {
//       writeStream.on('finish', () => {
//         console.log(`Successfully saved ${filename} to local folder '${localFolder}'.`);
//         resolve(filePath);
//       });

//       writeStream.on('error', (err) => {
//         console.error(`Failed to save ${filename} to local folder:`, err);
//         reject(err);
//       });
//     });
//   } catch (error) {
//     console.error(`Error downloading PDF from ${url}:`, error);
//   }
// }

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
