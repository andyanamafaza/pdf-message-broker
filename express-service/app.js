const express = require("express");
const amqp = require("amqplib");

const app = express();
const PORT = 3000;

let totalRequests = 0;
let successfulRequests = 0;

app.use(express.json());

app.get("/status", (req, res) => {
  res.json({ totalRequests, successfulRequests });
});

async function sendToQueue(urls) {
  totalRequests += 1;
  try {
    const connection = await amqp.connect("amqp://rabbitmq");
    const channel = await connection.createChannel();
    await channel.assertQueue("pdf_queue");
    channel.sendToQueue("pdf_queue", Buffer.from(JSON.stringify({ urls })));
    successfulRequests += 1;
  } catch (error) {
    console.error("Failed to send to queue:", error.message);
    throw new Error("Failed to process request");
  }
}

app.post("/download", async (req, res) => {
  const { urls } = req.body;
  if (urls && urls.length) {
    try {
      await sendToQueue(urls);
      res.status(200).send("Request received");
    } catch (error) {
      res.status(500).send("Internal Server Error");
    }
  } else {
    res.status(400).send("No URLs provided");
  }
});

app.listen(PORT, () => {
  console.log(`Express service running on http://localhost:${PORT}`);
});
