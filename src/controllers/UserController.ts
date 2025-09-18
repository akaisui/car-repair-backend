import { Request, Response } from 'express';
import BaseController from './BaseController';
import User from '../models/User';

export default class UserController extends BaseController {

  /**
   * Register push token for user
   */
  registerPushToken = this.asyncHandler(async (req: Request, res: Response) => {
    const { push_token, device_type } = req.body;
    const user = this.getUser(req);

    if (!push_token) {
      throw new Error('Push token is required');
    }

    // Update user with push token
    await User.updatePushToken(user.id, push_token, device_type || 'unknown');

    console.log(`🔔 Push token registered for user ${user.id}: ${push_token}`);

    return this.success(res, { push_token }, 'Push token registered successfully');
  });

  /**
   * Remove push token (on logout)
   */
  removePushToken = this.asyncHandler(async (req: Request, res: Response) => {
    const user = this.getUser(req);

    // Clear push token
    await User.updatePushToken(user.id, null, null);

    console.log(`🔔 Push token removed for user ${user.id}`);

    return this.success(res, {}, 'Push token removed successfully');
  });

}