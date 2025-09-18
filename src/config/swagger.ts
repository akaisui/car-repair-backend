import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Car Repair Shop API',
      version: '1.0.0',
      description: 'API documentation for Car Repair Shop Management System',
      contact: {
        name: 'API Support',
        email: 'admin@carrepair.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'https://api.carrepair.com',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        // Error Response
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
            message: {
              type: 'string',
              example: 'Operation successful',
            },
            data: {
              oneOf: [{ type: 'object' }, { type: 'array' }, { type: 'null' }],
            },
            error: {
              type: 'string',
              example: null,
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
        },

        // Paginated Response
        PaginatedResponse: {
          allOf: [
            { $ref: '#/components/schemas/ApiResponse' },
            {
              type: 'object',
              properties: {
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'number', example: 1 },
                    limit: { type: 'number', example: 10 },
                    total: { type: 'number', example: 100 },
                    totalPages: { type: 'number', example: 10 },
                    hasNext: { type: 'boolean', example: true },
                    hasPrev: { type: 'boolean', example: false },
                  },
                },
              },
            },
          ],
        },

        // User Schema
        User: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            email: { type: 'string', format: 'email', example: 'user@example.com' },
            full_name: { type: 'string', example: 'Nguyễn Văn A' },
            phone: { type: 'string', example: '0901234567' },
            role: { type: 'string', enum: ['admin', 'staff', 'customer'], example: 'customer' },
            is_active: { type: 'boolean', example: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // Auth Response
        AuthResponse: {
          type: 'object',
          properties: {
            user: { $ref: '#/components/schemas/User' },
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          },
        },

        // Customer Schema
        Customer: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            user_id: { type: 'number', example: 1 },
            customer_code: { type: 'string', example: 'KH001' },
            address: { type: 'string', example: '123 Đường ABC, Q1, TP.HCM' },
            date_of_birth: { type: 'string', format: 'date', example: '1990-01-01' },
            gender: { type: 'string', enum: ['male', 'female', 'other'], example: 'male' },
            loyalty_points: { type: 'number', example: 100 },
            total_spent: { type: 'number', example: 1500000 },
            notes: { type: 'string', example: 'VIP customer' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // Vehicle Schema
        Vehicle: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            customer_id: { type: 'number', example: 1 },
            license_plate: { type: 'string', example: '59A-12345' },
            brand: { type: 'string', example: 'Honda' },
            model: { type: 'string', example: 'Air Blade 150' },
            year: { type: 'number', example: 2022 },
            color: { type: 'string', example: 'Đen' },
            engine_number: { type: 'string', example: 'AB123456' },
            chassis_number: { type: 'string', example: 'CH789012' },
            mileage: { type: 'number', example: 15000 },
            notes: { type: 'string', example: 'Regular maintenance' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // Service Category Schema
        ServiceCategory: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            name: { type: 'string', example: 'Sửa chữa cơ bản' },
            slug: { type: 'string', example: 'sua-chua-co-ban' },
            description: { type: 'string', example: 'Các dịch vụ sửa chữa cơ bản' },
            icon: { type: 'string', example: 'wrench' },
            sort_order: { type: 'number', example: 1 },
            is_active: { type: 'boolean', example: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // Service Schema
        Service: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            category_id: { type: 'number', example: 1 },
            name: { type: 'string', example: 'Thay nhớt động cơ' },
            slug: { type: 'string', example: 'thay-nhot-dong-co' },
            description: { type: 'string', example: 'Thay nhớt động cơ chất lượng cao' },
            short_description: { type: 'string', example: 'Thay nhớt chính hãng' },
            price: { type: 'number', example: 120000 },
            min_price: { type: 'number', example: 100000 },
            max_price: { type: 'number', example: 150000 },
            duration_minutes: { type: 'number', example: 30 },
            image_url: { type: 'string', example: '/images/oil-change.jpg' },
            is_featured: { type: 'boolean', example: true },
            is_active: { type: 'boolean', example: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // Appointment Schema
        Appointment: {
          type: 'object',
          properties: {
            id: { type: 'number', example: 1 },
            appointment_code: { type: 'string', example: 'AP202401001' },
            customer_id: { type: 'number', example: 1 },
            vehicle_id: { type: 'number', example: 1 },
            service_id: { type: 'number', example: 1 },
            appointment_date: { type: 'string', format: 'date', example: '2024-01-15' },
            appointment_time: {
              type: 'string',
              pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
              example: '10:00',
            },
            status: {
              type: 'string',
              enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
              example: 'confirmed',
            },
            notes: { type: 'string', example: 'First appointment' },
            reminder_sent: { type: 'boolean', example: false },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },

        // Error Schema
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'An error occurred' },
            error: { type: 'string', example: 'ERROR_CODE' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },

        // Validation Error Schema
        ValidationError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Validation failed' },
            data: {
              type: 'object',
              properties: {
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      field: { type: 'string', example: 'email' },
                      message: { type: 'string', example: 'Email is required' },
                      code: { type: 'string', example: 'REQUIRED_FIELD' },
                    },
                  },
                },
              },
            },
            error: { type: 'string', example: 'VALIDATION_ERROR' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        Success: {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiResponse' },
            },
          },
        },
        BadRequest: {
          description: 'Bad request',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationError' },
            },
          },
        },
        Unauthorized: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        Forbidden: {
          description: 'Forbidden',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        NotFound: {
          description: 'Not found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        InternalServerError: {
          description: 'Internal server error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number',
          required: false,
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
        },
        SortByParam: {
          name: 'sortBy',
          in: 'query',
          description: 'Field to sort by',
          required: false,
          schema: { type: 'string', default: 'created_at' },
        },
        SortOrderParam: {
          name: 'sortOrder',
          in: 'query',
          description: 'Sort order',
          required: false,
          schema: { type: 'string', enum: ['ASC', 'DESC'], default: 'DESC' },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication endpoints',
      },
      {
        name: 'Users',
        description: 'User management endpoints',
      },
      {
        name: 'Customers',
        description: 'Customer management endpoints',
      },
      {
        name: 'Vehicles',
        description: 'Vehicle management endpoints',
      },
      {
        name: 'Services',
        description: 'Service management endpoints',
      },
      {
        name: 'Appointments',
        description: 'Appointment management endpoints',
      },
      {
        name: 'Repairs',
        description: 'Repair management endpoints',
      },
      {
        name: 'Parts',
        description: 'Parts inventory management endpoints',
      },
      {
        name: 'Invoices',
        description: 'Invoice management endpoints',
      },
      {
        name: 'Reviews',
        description: 'Customer review endpoints',
      },
      {
        name: 'Dashboard',
        description: 'Dashboard and statistics endpoints',
      },
      {
        name: 'Public',
        description: 'Public endpoints (no authentication required)',
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts', './src/models/*.ts'],
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app: Application): void => {
  // Swagger UI options
  const swaggerOptions = {
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      docExpansion: 'none',
      filter: true,
      showRequestHeaders: true,
      tryItOutEnabled: true,
    },
    customCss: `
      .swagger-ui .topbar { display: none }
      .swagger-ui .info { margin: 20px 0; }
      .swagger-ui .info .title { color: #3b82f6; }
    `,
    customSiteTitle: 'Car Repair Shop API Documentation',
    customfavIcon: '/favicon.ico',
  };

  // Serve Swagger docs
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerOptions));

  // Serve Swagger JSON
  app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });

  console.log('📖 Swagger documentation available at /api-docs');
};

export default specs;
