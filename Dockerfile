# Development Dockerfile for Backend
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy application files
COPY . .

# Expose port
EXPOSE 5000

# Start the application in development mode
CMD ["npm", "run", "dev"]