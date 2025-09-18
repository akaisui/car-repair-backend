import { Request, Response } from 'express';
import BaseController from './BaseController';
import Vehicle, { VehicleSearchFilters } from '../models/Vehicle';
import User from '../models/User';
import { AppError } from '../utils';

/**
 * Vehicle Controller
 * Handles vehicle management operations for customers
 */
export default class VehicleController extends BaseController {
  private readonly allowedFields = [
    'user_id',
    'license_plate',
    'brand',
    'model',
    'year',
    'color',
    'engine_number',
    'chassis_number',
    'mileage',
    'notes',
  ];

  /**
   * Get all vehicles with pagination and filters
   */
  getAllVehicles = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { search, brand, year_from, year_to, user_id } = req.query;

    const filters: VehicleSearchFilters = {};

    if (search) filters.search = search as string;
    if (brand) filters.brand = brand as string;
    if (year_from) filters.year_from = parseInt(year_from as string);
    if (year_to) filters.year_to = parseInt(year_to as string);
    if (user_id) filters.user_id = parseInt(user_id as string);

    const vehicles = await Vehicle.search(filters, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `${pagination.sortBy} ${pagination.sortOrder}`,
    });

    // Get total count (simplified)
    const total = await Vehicle.count();

    return this.paginated(res, vehicles, total, pagination, 'Vehicles retrieved successfully');
  });

  /**
   * Get vehicle by ID with full information
   */
  getVehicleById = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const vehicles = await Vehicle.findWithCustomerInfo({ where: { id } });

    if (vehicles.length === 0) {
      return this.notFound(res, 'Vehicle');
    }

    const vehicle = vehicles[0];

    // Get additional vehicle information
    const [serviceHistory, upcomingAppointments] = await Promise.all([
      Vehicle.getServiceHistory(id),
      Vehicle.getUpcomingAppointments(id),
    ]);

    const vehicleWithDetails = {
      ...vehicle,
      service_history: serviceHistory,
      upcoming_appointments: upcomingAppointments,
    };

    return this.success(res, vehicleWithDetails, 'Vehicle retrieved successfully');
  });

  /**
   * Get vehicle by license plate
   */
  getVehicleByLicensePlate = this.asyncHandler(async (req: Request, res: Response) => {
    const { license_plate } = req.params;

    if (!Vehicle.validateLicensePlate(license_plate)) {
      throw new AppError('Invalid license plate format', 400);
    }

    const vehicle = await Vehicle.findByLicensePlate(license_plate);

    if (!vehicle) {
      return this.notFound(res, 'Vehicle');
    }

    return this.success(res, vehicle, 'Vehicle retrieved successfully');
  });

  /**
   * Create new vehicle
   */
  createVehicle = this.asyncHandler(async (req: Request, res: Response) => {
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate required fields
    this.validateRequired(data, ['user_id', 'license_plate']);

    // Validate user exists
    const user = await User.findById(data.user_id);
    if (!user) {
      throw new AppError('User not found', 400);
    }

    // Validate license plate format
    if (!Vehicle.validateLicensePlate(data.license_plate)) {
      throw new AppError('Invalid license plate format', 400);
    }

    // Check if license plate already exists
    const existingVehicle = await Vehicle.findByLicensePlate(data.license_plate);
    if (existingVehicle) {
      throw new AppError('Vehicle with this license plate already exists', 400);
    }

    const vehicle = await Vehicle.create(data);

    // Return vehicle with customer info
    const vehicleWithCustomer = await Vehicle.findWithCustomerInfo({ where: { id: vehicle.id } });

    return this.success(res, vehicleWithCustomer[0], 'Vehicle created successfully', 201);
  });

  /**
   * Update vehicle
   */
  updateVehicle = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);
    const data = this.filterFields(req.body, this.allowedFields);

    // Validate user exists if provided
    if (data.user_id) {
      const user = await User.findById(data.user_id);
      if (!user) {
        throw new AppError('User not found', 400);
      }
    }

    // Validate license plate format if provided
    if (data.license_plate) {
      if (!Vehicle.validateLicensePlate(data.license_plate)) {
        throw new AppError('Invalid license plate format', 400);
      }

      // Check if license plate already exists (excluding current vehicle)
      const existingVehicle = await Vehicle.findByLicensePlate(data.license_plate);
      if (existingVehicle && existingVehicle.id !== id) {
        throw new AppError('Vehicle with this license plate already exists', 400);
      }
    }

    const vehicle = await Vehicle.updateById(id, data);

    if (!vehicle) {
      return this.notFound(res, 'Vehicle');
    }

    // Return updated vehicle with customer info
    const vehicleWithCustomer = await Vehicle.findWithCustomerInfo({ where: { id } });

    return this.success(res, vehicleWithCustomer[0], 'Vehicle updated successfully');
  });

  /**
   * Delete vehicle (soft delete)
   */
  deleteVehicle = this.asyncHandler(async (req: Request, res: Response) => {
    const id = this.parseId(req);

    // Note: Since vehicles table doesn't have is_active field, we'll do hard delete
    // In production, you might want to add soft delete capability
    const success = await Vehicle.deleteById(id);

    if (!success) {
      return this.notFound(res, 'Vehicle');
    }

    return this.success(res, null, 'Vehicle deleted successfully');
  });

  /**
   * Search vehicles
   */
  searchVehicles = this.asyncHandler(async (req: Request, res: Response) => {
    const pagination = this.getPagination(req);
    const { search, brand, year_from, year_to, user_id } = req.query;

    const filters: VehicleSearchFilters = {};

    if (search) filters.search = search as string;
    if (brand) filters.brand = brand as string;
    if (year_from) filters.year_from = parseInt(year_from as string);
    if (year_to) filters.year_to = parseInt(year_to as string);
    if (user_id) filters.user_id = parseInt(user_id as string);

    const vehicles = await Vehicle.search(filters, {
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
      orderBy: `${pagination.sortBy} ${pagination.sortOrder}`,
    });

    // Get total count (simplified)
    const total = vehicles.length;

    return this.paginated(res, vehicles, total, pagination, 'Vehicles searched successfully');
  });

  /**
   * Get vehicles by user
   */
  getVehiclesByUser = this.asyncHandler(async (req: Request, res: Response) => {
    const userId = this.parseId(req, 'userId');

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return this.notFound(res, 'User');
    }

    const vehicles = await Vehicle.findByUserId(userId);

    return this.success(res, vehicles, 'User vehicles retrieved successfully');
  });

  /**
   * Get vehicle service history
   */
  getVehicleServiceHistory = this.asyncHandler(async (req: Request, res: Response) => {
    const vehicleId = this.parseId(req, 'vehicleId');

    // Verify vehicle exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return this.notFound(res, 'Vehicle');
    }

    const serviceHistory = await Vehicle.getServiceHistory(vehicleId);

    return this.success(res, serviceHistory, 'Vehicle service history retrieved successfully');
  });

  /**
   * Get vehicle upcoming appointments
   */
  getVehicleUpcomingAppointments = this.asyncHandler(async (req: Request, res: Response) => {
    const vehicleId = this.parseId(req, 'vehicleId');

    // Verify vehicle exists
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return this.notFound(res, 'Vehicle');
    }

    const upcomingAppointments = await Vehicle.getUpcomingAppointments(vehicleId);

    return this.success(
      res,
      upcomingAppointments,
      'Vehicle upcoming appointments retrieved successfully'
    );
  });

  /**
   * Update vehicle mileage
   */
  updateVehicleMileage = this.asyncHandler(async (req: Request, res: Response) => {
    const vehicleId = this.parseId(req, 'vehicleId');
    const { mileage } = req.body;

    if (!mileage || mileage < 0) {
      throw new AppError('Valid mileage is required', 400);
    }

    const success = await Vehicle.updateMileage(vehicleId, mileage);

    if (!success) {
      return this.notFound(res, 'Vehicle or mileage is not higher than current');
    }

    // Get updated vehicle
    const vehicle = await Vehicle.findById(vehicleId);

    return this.success(
      res,
      {
        vehicle_id: vehicleId,
        new_mileage: mileage,
        vehicle,
      },
      'Vehicle mileage updated successfully'
    );
  });

  /**
   * Get vehicle statistics
   */
  getVehicleStatistics = this.asyncHandler(async (_req: Request, res: Response) => {
    const statistics = await Vehicle.getStatistics();

    return this.success(res, statistics, 'Vehicle statistics retrieved successfully');
  });

  /**
   * Get vehicles needing maintenance
   */
  getVehiclesNeedingMaintenance = this.asyncHandler(async (req: Request, res: Response) => {
    const daysSinceLastService = req.query.days ? parseInt(req.query.days as string) : 180;

    const vehicles = await Vehicle.getVehiclesNeedingMaintenance(daysSinceLastService);

    return this.success(
      res,
      {
        days_since_service_threshold: daysSinceLastService,
        vehicles_needing_maintenance: vehicles.length,
        vehicles,
      },
      'Vehicles needing maintenance retrieved successfully'
    );
  });

  /**
   * Get popular vehicle brands
   */
  getPopularBrands = this.asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;

    const popularBrands = await Vehicle.getPopularBrands(limit);

    return this.success(res, popularBrands, 'Popular vehicle brands retrieved successfully');
  });

  /**
   * Validate license plate format
   */
  validateLicensePlate = this.asyncHandler(async (req: Request, res: Response) => {
    const { license_plate } = req.body;

    if (!license_plate) {
      throw new AppError('License plate is required', 400);
    }

    const isValid = Vehicle.validateLicensePlate(license_plate);
    const formatted = Vehicle.formatLicensePlate(license_plate);

    return this.success(
      res,
      {
        license_plate,
        is_valid: isValid,
        formatted_license_plate: formatted,
        message: isValid ? 'License plate is valid' : 'Invalid license plate format',
      },
      'License plate validation completed'
    );
  });

  /**
   * Get vehicles by brand
   */
  getVehiclesByBrand = this.asyncHandler(async (req: Request, res: Response) => {
    const { brand } = req.params;
    const pagination = this.getPagination(req);

    const vehicles = await Vehicle.search(
      { brand },
      {
        limit: pagination.limit,
        offset: (pagination.page - 1) * pagination.limit,
        orderBy: `${pagination.sortBy} ${pagination.sortOrder}`,
      }
    );

    const total = await Vehicle.count({ brand });

    return this.paginated(
      res,
      vehicles,
      total,
      pagination,
      'Vehicles by brand retrieved successfully'
    );
  });

  /**
   * Get vehicles by year range
   */
  getVehiclesByYear = this.asyncHandler(async (req: Request, res: Response) => {
    const { year_from, year_to } = req.query;

    if (!year_from || !year_to) {
      throw new AppError('Both year_from and year_to are required', 400);
    }

    const vehicles = await Vehicle.search({
      year_from: parseInt(year_from as string),
      year_to: parseInt(year_to as string),
    });

    return this.success(
      res,
      {
        year_range: `${year_from} - ${year_to}`,
        total_vehicles: vehicles.length,
        vehicles,
      },
      'Vehicles by year range retrieved successfully'
    );
  });

  /**
   * Get recent vehicles (newly registered)
   */
  getRecentVehicles = this.asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const recentVehicles = await Vehicle.findWithCustomerInfo({
      limit,
      orderBy: 'v.created_at DESC',
    });

    return this.success(res, recentVehicles, 'Recent vehicles retrieved successfully');
  });

  /**
   * Export vehicles list to CSV
   */
  exportVehicles = this.asyncHandler(async (req: Request, res: Response) => {
    const { format = 'csv', search, brand, user_id } = req.query;

    if (format !== 'csv' && format !== 'json') {
      throw new AppError('Invalid format. Supported formats: csv, json', 400);
    }

    const filters: VehicleSearchFilters = {};
    if (search) filters.search = search as string;
    if (brand) filters.brand = brand as string;
    if (user_id) filters.user_id = parseInt(user_id as string);

    const vehicles = await Vehicle.search(filters, {
      orderBy: 'created_at DESC',
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="vehicles.json"');
      return res.send(JSON.stringify(vehicles, null, 2));
    }

    // CSV format
    const csvHeader = [
      'ID',
      'License Plate',
      'Brand',
      'Model',
      'Year',
      'Color',
      'Engine Number',
      'Chassis Number',
      'Mileage',
      'Customer Name',
      'Customer Phone',
      'Created At',
    ].join(',');

    const csvRows = vehicles.map((vehicle) =>
      [
        vehicle.id,
        `"${vehicle.license_plate || ''}"`,
        `"${vehicle.brand || ''}"`,
        `"${vehicle.model || ''}"`,
        vehicle.year || '',
        `"${vehicle.color || ''}"`,
        `"${vehicle.engine_number || ''}"`,
        `"${vehicle.chassis_number || ''}"`,
        vehicle.mileage || 0,
        `"${vehicle.customer_name || ''}"`,
        `"${vehicle.customer_phone || ''}"`,
        `"${vehicle.created_at || ''}"`,
      ].join(',')
    );

    const csvContent = [csvHeader, ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="vehicles.csv"');
    return res.send('\ufeff' + csvContent); // BOM for UTF-8
  });
}
