# PDF Downloader with RabbitMQ and Minio

This project demonstrates a PDF downloading service using RabbitMQ as the message broker and Minio as the object storage. The project consists of two services running in a single repository:

1. **PDF Downloader Service**: Handles downloading PDF files from URLs provided in an array, processes using RabbitMQ, and stores them in Minio.
2. **Express Service**: Displays the number of processed data and the number of successful requests.

## Project Structure

```plaintext
.
├── README.md
├── docker-compose.yml
├── express-service
│   ├── Dockerfile
│   ├── app.js
│   └── package.json
├── pdf-downloader-service
│   ├── Dockerfile
│   ├── index.js
│   └── package.json
└── test
    ├── package.json
    └── test-case.js
```

## Getting Started
1. **Clone the Repository**
```bash
git clone https://github.com/andyanamafaza/pdf-message-broker.git
cd pdf-message-broker
```
2. **Build and Start the Services**
The project is configured to run both services using Docker Compose. To start the services, simply run:
```bash
docker-compose up --build
```
3. **Access the Services**
- **Express Service**: Access the service that displays the processed data statistics at **http://localhost:3000**.
- **Minio Dashboard**: Access the Minio UI at **http://localhost:9000**. Use the credentials defined in the **`docker-compose.yml`** file to log in.
4. **Sending a PDF Download Requests**

Testing the service:
```bash
cd test
node test-case.js
```
4. **Monitoring the Process**

You can monitor the process through the logs:
```bash
docker-compose logs -f pdf-downloader-service
```# PDF Downloader with RabbitMQ and Minio

This project demonstrates a PDF downloading service using RabbitMQ as the message broker and Minio as the object storage. The project consists of two services running in a single repository:

1. **PDF Downloader Service**: Handles downloading PDF files from URLs provided in an array, processes using RabbitMQ, and stores them in Minio.
2. **Express Service**: Displays the number of processed data and the number of successful requests.

## Project Structure

```plaintext
.
├── README.md
├── docker-compose.yml
├── express-service
│   ├── Dockerfile
│   ├── app.js
│   └── package.json
├── pdf-downloader-service
│   ├── Dockerfile
│   ├── index.js
│   └── package.json
└── test
    ├── package.json
    └── test-case.js
```

## Getting Started
1. **Clone the Repository**
```bash
git clone https://github.com/andyanamafaza/pdf-message-broker.git
cd pdf-message-broker
```
2. **Build and Start the Services**
The project is configured to run both services using Docker Compose. To start the services, simply run:
```bash
docker-compose up --build
```
3. **Access the Services**
- **Express Service**: Access the service that displays the processed data statistics at **http://localhost:3000**.
- **Minio Dashboard**: Access the Minio UI at **http://localhost:9000**. Use the credentials defined in the **`docker-compose.yml`** file to log in.
4. **Sending a PDF Download Requests**

Testing the service:
```bash
cd test
node test-case.js
```
4. **Monitoring the Process**

You can monitor the process through the logs:
```bash
docker-compose logs -f pdf-downloader-service
```