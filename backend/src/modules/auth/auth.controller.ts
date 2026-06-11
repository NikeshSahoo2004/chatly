import { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { config } from '../../config';

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 0;
  }
}

export class AuthController {
  private authService = new AuthService();

  // Helper to get cookie options
  private getCookieOptions(type: 'access' | 'refresh') {
    const isProd = config.env === 'production';
    const durationStr = type === 'access' ? config.jwt.expiration : config.jwt.refreshExpiration;
    // Safely parse duration to milliseconds
    const maxAge = parseDuration(durationStr);

    return {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? ('none' as const) : ('lax' as const),
      maxAge,
      path: '/',
    };
  }

  /**
   * Handle user registration
   */
  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await this.authService.register(req.body);
      res.status(201).json({
        status: 'success',
        message: 'User registered successfully',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Handle user login
   */
  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, username, password } = req.body;
      const { user, accessToken, refreshToken } = await this.authService.login(email, username, password);

      // Set cookies
      res.cookie('accessToken', accessToken, this.getCookieOptions('access'));
      res.cookie('refreshToken', refreshToken, this.getCookieOptions('refresh'));

      res.status(200).json({
        status: 'success',
        message: 'Logged in successfully',
        data: {
          user,
          accessToken, // Return in body as well for custom headers if needed
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Handle token refresh / session rotation
   */
  public refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Get refresh token from cookie or authorization header
      const token = req.cookies.refreshToken || req.body.refreshToken;

      if (!token) {
        res.status(401).json({
          status: 'error',
          message: 'Refresh token is required',
        });
        return;
      }

      const { accessToken, refreshToken } = await this.authService.rotateRefreshToken(token);

      // Set cookies
      res.cookie('accessToken', accessToken, this.getCookieOptions('access'));
      res.cookie('refreshToken', refreshToken, this.getCookieOptions('refresh'));

      res.status(200).json({
        status: 'success',
        message: 'Token refreshed successfully',
        data: {
          accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Handle user logout
   */
  public logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const token = req.cookies.refreshToken || req.body.refreshToken;

      if (userId && token) {
        await this.authService.logout(userId, token);
      }

      // Clear cookies
      res.clearCookie('accessToken', {
        path: '/',
        secure: config.env === 'production',
        sameSite: config.env === 'production' ? ('none' as const) : ('lax' as const),
      });
      res.clearCookie('refreshToken', {
        path: '/',
        secure: config.env === 'production',
        sameSite: config.env === 'production' ? ('none' as const) : ('lax' as const),
      });

      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Get current user profile (session verification)
   */
  public getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          status: 'error',
          message: 'Not authenticated',
        });
        return;
      }

      const user = await this.authService.getCurrentUser(userId);

      res.status(200).json({
        status: 'success',
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  };
}
