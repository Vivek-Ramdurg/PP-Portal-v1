# Use official Node.js LTS
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy dependency files first (better caching)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy rest of the source code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Expose backend port
EXPOSE 4000

# Start the server
CMD ["node", "index.js"]
