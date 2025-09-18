import { Request, Response } from 'express';
import { AppError } from '../utils';
import Repair, { RepairSearchFilters } from '../models/Repair';
import RepairService from '../models/RepairService';
import RepairPart from '../models/RepairPart';
import UserModel from '../models/User';
import Vehicle from '../models/Vehicle';
import Service from '../models/Service';
import Part from '../models/Part';
import { User } from '../types';

interface AuthRequest extends Request {
  user?: User;
}

export class RepairController {
  // Create new repair
  static async createRepair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const {
        appointment_id,
        user_id,
        vehicle_id,
        diagnosis,
        work_description,
        estimated_completion,
        notes,
        services = [],
        parts = []
      } = req.body;

      // Validate required fields
      if (!user_id || !vehicle_id) {
        throw new AppError('Khách hàng và xe là bắt buộc', 400);
      }

      // Validate user and vehicle exist
      const user = await UserModel.findById(user_id);
      if (!user) {
        throw new AppError('Không tìm thấy khách hàng', 404);
      }

      const vehicle = await Vehicle.findById(vehicle_id);
      if (!vehicle) {
        throw new AppError('Không tìm thấy xe', 404);
      }

      // Validate parts availability if provided
      if (parts.length > 0) {
        const validation = await RepairPart.validatePartAvailability(parts);
        if (!validation.valid) {
          throw new AppError('Một số phụ tùng không đủ tồn kho', 400);
        }
      }

      // Generate repair code
      const repairCode = await Repair.generateRepairCode();

      // Create repair
      const repairId = await Repair.create({
        repair_code: repairCode,
        appointment_id,
        user_id,
        vehicle_id,
        mechanic_id: req.user?.id,
        status: 'pending',
        diagnosis,
        work_description,
        completion_date: estimated_completion ? new Date(estimated_completion) : undefined,
        notes
      });

      // Add services if provided
      if (services.length > 0) {
        await RepairService.bulkAddServices(repairId, services);
      }

      // Add parts if provided
      if (parts.length > 0) {
        await RepairPart.bulkAddParts(repairId, parts);
      }

      // Recalculate costs
      await Repair.recalculateCosts(repairId);

      // Get created repair with full details
      const repair = await Repair.findById(repairId);

      res.status(201).json({
        success: true,
        data: repair,
        message: 'Phiếu sửa chữa đã được tạo thành công'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error creating repair:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi tạo phiếu sửa chữa'
        });
      }
    }
  }

  // Get all repairs with filters
  static async getAllRepairs(req: Request, res: Response): Promise<void> {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        user_id,
        vehicle_id,
        mechanic_id,
        date_from,
        date_to,
        repair_code,
        customer_phone,
        license_plate,
        min_cost,
        max_cost,
        order_by = 'created_at',
        order_direction = 'DESC'
      } = req.query;

      const filters: RepairSearchFilters & any = {
        status: status as string,
        user_id: user_id ? parseInt(user_id as string) : undefined,
        vehicle_id: vehicle_id ? parseInt(vehicle_id as string) : undefined,
        mechanic_id: mechanic_id ? parseInt(mechanic_id as string) : undefined,
        date_from: date_from as string,
        date_to: date_to as string,
        repair_code: repair_code as string,
        customer_phone: customer_phone as string,
        license_plate: license_plate as string,
        min_cost: min_cost ? parseFloat(min_cost as string) : undefined,
        max_cost: max_cost ? parseFloat(max_cost as string) : undefined,
        limit: parseInt(limit as string),
        offset: (parseInt(page as string) - 1) * parseInt(limit as string),
        order_by: order_by as string,
        order_direction: order_direction as 'ASC' | 'DESC'
      };

      const [repairs, total] = await Promise.all([
        Repair.findAll(filters),
        Repair.count(filters)
      ]);

      const totalPages = Math.ceil(total / parseInt(limit as string));

      res.json({
        success: true,
        data: {
          repairs,
          pagination: {
            current_page: parseInt(page as string),
            total_pages: totalPages,
            total_items: total,
            items_per_page: parseInt(limit as string)
          }
        }
      });

    } catch (error) {
      console.error('Error getting repairs:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy danh sách sửa chữa'
      });
    }
  }

  // Get repair by ID
  static async getRepairById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repair = await Repair.findById(parseInt(id));

      if (!repair) {
        throw new AppError('Không tìm thấy phiếu sửa chữa', 404);
      }

      // Get services and parts
      const [services, parts] = await Promise.all([
        RepairService.findByRepairId(repair.id!),
        RepairPart.findByRepairId(repair.id!)
      ]);

      res.json({
        success: true,
        data: {
          ...repair,
          services,
          parts
        }
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error getting repair:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy thông tin sửa chữa'
        });
      }
    }
  }

  // Update repair
  static async updateRepair(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const {
        mechanic_id,
        status,
        diagnosis,
        work_description,
        estimated_completion,
        notes
      } = req.body;

      const updateData: any = {};

      if (mechanic_id !== undefined) updateData.mechanic_id = mechanic_id;
      if (status !== undefined) updateData.status = status;
      if (diagnosis !== undefined) updateData.diagnosis = diagnosis;
      if (work_description !== undefined) updateData.work_description = work_description;
      if (estimated_completion !== undefined) updateData.completion_date = new Date(estimated_completion);
      if (notes !== undefined) updateData.notes = notes;

      const success = await Repair.update(parseInt(id), updateData);

      if (!success) {
        throw new AppError('Không tìm thấy phiếu sửa chữa', 404);
      }

      const repair = await Repair.findById(parseInt(id));

      res.json({
        success: true,
        data: repair,
        message: 'Cập nhật phiếu sửa chữa thành công'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error updating repair:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi cập nhật phiếu sửa chữa'
        });
      }
    }
  }

  // Update repair status
  static async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status) {
        throw new AppError('Trạng thái là bắt buộc', 400);
      }

      const validStatuses = ['pending', 'diagnosing', 'waiting_parts', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new AppError('Trạng thái không hợp lệ', 400);
      }

      const success = await Repair.updateStatus(parseInt(id), status, notes);

      if (!success) {
        throw new AppError('Không tìm thấy phiếu sửa chữa', 404);
      }

      const repair = await Repair.findById(parseInt(id));

      res.json({
        success: true,
        data: repair,
        message: `Đã cập nhật trạng thái thành ${status}`
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error updating repair status:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi cập nhật trạng thái'
        });
      }
    }
  }

  // Assign mechanic
  static async assignMechanic(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { mechanic_id } = req.body;

      if (!mechanic_id) {
        throw new AppError('ID thợ sửa xe là bắt buộc', 400);
      }

      // Verify mechanic exists and has appropriate role
      const mechanic = await UserModel.findById(mechanic_id);
      if (!mechanic || (mechanic.role !== 'staff' && mechanic.role !== 'admin')) {
        throw new AppError('Không tìm thấy thợ sửa xe', 404);
      }

      const success = await Repair.assignMechanic(parseInt(id), mechanic_id);

      if (!success) {
        throw new AppError('Không tìm thấy phiếu sửa chữa', 404);
      }

      const repair = await Repair.findById(parseInt(id));

      res.json({
        success: true,
        data: repair,
        message: `Đã phân công thợ ${mechanic.full_name}`
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error assigning mechanic:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi phân công thợ'
        });
      }
    }
  }

  // Delete repair
  static async deleteRepair(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const success = await Repair.delete(parseInt(id));

      if (!success) {
        throw new AppError('Không tìm thấy phiếu sửa chữa', 404);
      }

      res.json({
        success: true,
        message: 'Đã xóa phiếu sửa chữa'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error deleting repair:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xóa phiếu sửa chữa'
        });
      }
    }
  }

  // Get repair history for customer
  static async getRepairHistory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { user_id, vehicle_id, limit = 20 } = req.query;

      let customerId = user_id ? parseInt(user_id as string) : undefined;

      // If no user_id provided, use current authenticated user
      if (!customerId && req.user) {
        customerId = req.user.id;
      }

      const repairs = await Repair.getRepairHistory(
        customerId,
        vehicle_id ? parseInt(vehicle_id as string) : undefined,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: repairs
      });

    } catch (error) {
      console.error('Error getting repair history:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy lịch sử sửa chữa'
      });
    }
  }

  // Get repair summary/statistics
  static async getRepairSummary(req: Request, res: Response): Promise<void> {
    try {
      const { date_from, date_to } = req.query;

      const summary = await Repair.getSummary(
        date_from as string,
        date_to as string
      );

      res.json({
        success: true,
        data: summary
      });

    } catch (error) {
      console.error('Error getting repair summary:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy thống kê sửa chữa'
      });
    }
  }

  // Get repairs by status
  static async getRepairsByStatus(req: Request, res: Response): Promise<void> {
    try {
      const { status } = req.params;
      const { limit = 20 } = req.query;

      const validStatuses = ['pending', 'diagnosing', 'waiting_parts', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new AppError('Trạng thái không hợp lệ', 400);
      }

      const repairs = await Repair.findAll({
        status,
        limit: parseInt(limit as string)
      });

      res.json({
        success: true,
        data: repairs
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error getting repairs by status:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi lấy danh sách sửa chữa theo trạng thái'
        });
      }
    }
  }

  // Get mechanic repairs
  static async getMechanicRepairs(req: Request, res: Response): Promise<void> {
    try {
      const { mechanic_id } = req.params;
      const { status, limit = 20 } = req.query;

      const repairs = await Repair.getRepairsByMechanic(
        parseInt(mechanic_id),
        status as any
      );

      res.json({
        success: true,
        data: repairs.slice(0, parseInt(limit as string))
      });

    } catch (error) {
      console.error('Error getting mechanic repairs:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy danh sách sửa chữa của thợ'
      });
    }
  }

  // Calculate/recalculate repair costs
  static async calculateCosts(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const success = await Repair.recalculateCosts(parseInt(id));

      if (!success) {
        throw new AppError('Không tìm thấy phiếu sửa chữa', 404);
      }

      const repair = await Repair.findById(parseInt(id));

      res.json({
        success: true,
        data: repair,
        message: 'Đã tính lại chi phí'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error calculating costs:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi tính chi phí'
        });
      }
    }
  }

  // Service management methods
  static async addService(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { service_id, quantity = 1, custom_price, notes } = req.body;

      if (!service_id) {
        throw new AppError('ID dịch vụ là bắt buộc', 400);
      }

      // Verify service exists
      const service = await Service.findById(service_id);
      if (!service) {
        throw new AppError('Không tìm thấy dịch vụ', 404);
      }

      const repairServiceId = await RepairService.addService(
        parseInt(id),
        service_id,
        quantity,
        custom_price
      );

      if (notes) {
        await RepairService.update(repairServiceId, { notes });
      }

      // Recalculate costs
      await Repair.recalculateCosts(parseInt(id));

      const repairService = await RepairService.findById(repairServiceId);

      res.json({
        success: true,
        data: repairService,
        message: 'Đã thêm dịch vụ'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error adding service:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi thêm dịch vụ'
        });
      }
    }
  }

  static async updateService(req: Request, res: Response): Promise<void> {
    try {
      const { id, serviceId } = req.params;
      const { quantity, unit_price, notes } = req.body;

      const updateData: any = {};
      if (quantity !== undefined) updateData.quantity = quantity;
      if (unit_price !== undefined) updateData.unit_price = unit_price;
      if (notes !== undefined) updateData.notes = notes;

      // Recalculate total_price if quantity or unit_price changed
      if (quantity !== undefined || unit_price !== undefined) {
        const repairService = await RepairService.findById(parseInt(serviceId));
        if (repairService) {
          const newQuantity = quantity !== undefined ? quantity : repairService.quantity;
          const newUnitPrice = unit_price !== undefined ? unit_price : repairService.unit_price;
          updateData.total_price = newQuantity * newUnitPrice;
        }
      }

      const success = await RepairService.update(parseInt(serviceId), updateData);

      if (!success) {
        throw new AppError('Không tìm thấy dịch vụ', 404);
      }

      // Recalculate repair costs
      await Repair.recalculateCosts(parseInt(id));

      const repairService = await RepairService.findById(parseInt(serviceId));

      res.json({
        success: true,
        data: repairService,
        message: 'Đã cập nhật dịch vụ'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error updating service:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi cập nhật dịch vụ'
        });
      }
    }
  }

  static async removeService(req: Request, res: Response): Promise<void> {
    try {
      const { id, serviceId } = req.params;

      const success = await RepairService.delete(parseInt(serviceId));

      if (!success) {
        throw new AppError('Không tìm thấy dịch vụ', 404);
      }

      // Recalculate repair costs
      await Repair.recalculateCosts(parseInt(id));

      res.json({
        success: true,
        message: 'Đã xóa dịch vụ'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error removing service:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xóa dịch vụ'
        });
      }
    }
  }

  // Parts management methods
  static async addPart(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { part_id, quantity, custom_price, notes } = req.body;

      if (!part_id || !quantity) {
        throw new AppError('ID phụ tùng và số lượng là bắt buộc', 400);
      }

      // Verify part exists and has enough stock
      const part = await Part.findById(part_id);
      if (!part) {
        throw new AppError('Không tìm thấy phụ tùng', 404);
      }

      const repairPartId = await RepairPart.addPart(
        parseInt(id),
        part_id,
        quantity,
        custom_price
      );

      if (notes) {
        await RepairPart.update(repairPartId, { notes });
      }

      // Recalculate costs
      await Repair.recalculateCosts(parseInt(id));

      const repairPart = await RepairPart.findById(repairPartId);

      res.json({
        success: true,
        data: repairPart,
        message: 'Đã thêm phụ tùng'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error adding part:', error);
        res.status(500).json({
          success: false,
          message: (error as Error).message || 'Lỗi server khi thêm phụ tùng'
        });
      }
    }
  }

  static async updatePart(req: Request, res: Response): Promise<void> {
    try {
      const { id, partId } = req.params;
      const { quantity, unit_price, notes } = req.body;

      if (quantity !== undefined) {
        await RepairPart.updateQuantity(parseInt(partId), quantity);
      }

      if (unit_price !== undefined) {
        await RepairPart.updatePrice(parseInt(partId), unit_price);
      }

      if (notes !== undefined) {
        await RepairPart.update(parseInt(partId), { notes });
      }

      // Recalculate repair costs
      await Repair.recalculateCosts(parseInt(id));

      const repairPart = await RepairPart.findById(parseInt(partId));

      if (!repairPart) {
        throw new AppError('Không tìm thấy phụ tùng', 404);
      }

      res.json({
        success: true,
        data: repairPart,
        message: 'Đã cập nhật phụ tùng'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error updating part:', error);
        res.status(500).json({
          success: false,
          message: (error as Error).message || 'Lỗi server khi cập nhật phụ tùng'
        });
      }
    }
  }

  static async removePart(req: Request, res: Response): Promise<void> {
    try {
      const { id, partId } = req.params;

      const success = await RepairPart.delete(parseInt(partId));

      if (!success) {
        throw new AppError('Không tìm thấy phụ tùng', 404);
      }

      // Recalculate repair costs
      await Repair.recalculateCosts(parseInt(id));

      res.json({
        success: true,
        message: 'Đã xóa phụ tùng'
      });

    } catch (error) {
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message
        });
      } else {
        console.error('Error removing part:', error);
        res.status(500).json({
          success: false,
          message: 'Lỗi server khi xóa phụ tùng'
        });
      }
    }
  }
}

export default RepairController;