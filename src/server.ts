import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { testConnection, initializeDatabase, getPoolStats } from './config/database';
import { setupSwagger } from './config/swagger';
import routes from './routes';

dotenv.config();

const app: Application = express();
const server = createServer(app);

// CORS origins configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://192.168.1.6:3000',
  'http://192.168.1.5:3000', // Support old IP
  ...(process.env.CORS_ORIGIN ? [process.env.CORS_ORIGIN] : []),
];

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});
const PORT = process.env.PORT || 5000;

// Make io available to routes/controllers
app.set('io', io);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    optionsSuccessStatus: 200,
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Custom request logging middleware for debugging
// app.use((req, _res, next) => {
//   console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.url}`);
//   console.log('Headers:', req.headers);
//   if (req.body && Object.keys(req.body).length > 0) {
//     console.log('Body:', req.body);
//   }
//   next();
// });

// Health check endpoint
app.get('/health', async (_req, res) => {
  try {
    const dbConnected = await testConnection();
    const poolStats = await getPoolStats();

    res.status(200).json({
      status: dbConnected ? 'OK' : 'DB_ERROR',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: dbConnected,
        poolStats,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'ERROR',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

// Setup Swagger documentation
setupSwagger(app);

// API routes
app.use('/', routes);

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    message: 'Route not found',
  });
});

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    console.log('🔄 Initializing database...');
    // await initializeDatabase();

    // Test connection pooling
    const dbConnected = await testConnection();
    if (!dbConnected) {
      throw new Error('Database connection failed');
    }

    // Socket.IO connection handling
    io.on('connection', (socket) => {
      console.log(`🔌 User connected: ${socket.id}`);

      // Join user to their own room for personal notifications
      socket.on('join', (data: { userId: number; role?: string }) => {
        // Join user-specific room
        socket.join(`user_${data.userId}`);
        console.log(`👤 User ${data.userId} joined room user_${data.userId}`);

        // Join role-based room if role is provided
        if (data.role) {
          socket.join(`role_${data.role}`);
          console.log(`👥 User ${data.userId} joined role room: role_${data.role}`);

          // Special handling for admin role
          if (data.role === 'admin') {
            socket.join('admin_room');
            console.log(`🔑 User ${data.userId} joined admin_room`);
          }
        }
      });

      // Handle joining role room separately (for backward compatibility)
      socket.on('join_role', (role: string) => {
        socket.join(`role_${role}`);
        console.log(`👥 Socket ${socket.id} joined role room: role_${role}`);
      });

      socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${socket.id}`);
      });
    });

    // Start server
    server.listen(Number(PORT), '0.0.0.0', () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`🔌 Socket.IO enabled`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔗 API endpoint: http://localhost:${PORT}/api`);
      console.log(`📖 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log('');
      console.log('Available migration commands:');
      console.log('  npm run migrate:up     - Run migrations');
      console.log('  npm run migrate:seed   - Seed database');
      console.log('  npm run migrate:reset  - Reset database');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
