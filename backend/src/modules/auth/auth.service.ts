import { UserRepository } from '../user/user.repository';
import { TokenService } from '../../services/token.service';
import { RefreshToken } from './refresh-token.model';
import { AppError } from '../../utils/errors';
import { IUser } from '../user/user.interface';
import { logger } from '../../utils/logger';

export class AuthService {
  private userRepo = new UserRepository();
  private tokenService = new TokenService();

  /**
   * Register a new user
   */
  public async register(userData: Partial<IUser>): Promise<IUser> {
    const { email, username } = userData;

    if (!email || !username) {
      throw new AppError('Email and username are required', 400);
    }

    // Check email uniqueness
    const existingEmail = await this.userRepo.findByEmail(email);
    if (existingEmail) {
      throw new AppError('Email address is already in use', 400);
    }

    // Check username uniqueness
    const existingUsername = await this.userRepo.findByUsername(username);
    if (existingUsername) {
      throw new AppError('Username is already taken', 400);
    }

    // Save user (pre-save hook will hash password)
    return this.userRepo.create(userData);
  }

  /**
   * Login user and generate token session
   */
  public async login(
    email: string | undefined,
    username: string | undefined,
    password: string
  ): Promise<{ user: IUser; accessToken: string; refreshToken: string }> {
    let user: IUser | null = null;

    if (email) {
      user = await this.userRepo.findByEmail(email);
    } else if (username) {
      user = await this.userRepo.findByUsername(username);
    }

    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    // Compare passwords
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Invalid credentials', 401);
    }

    // Set online status
    await this.userRepo.updateOnlineStatus(user.id, true);

    // Generate tokens
    const accessToken = this.tokenService.generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });

    const refreshToken = this.tokenService.generateRefreshToken({
      userId: user.id,
    });

    // Save refresh token to DB with expiry (7 days fallback)
    const decoded = this.tokenService.verifyRefreshToken(refreshToken);
    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      expiresAt,
    });

    return { user, accessToken, refreshToken };
  }

  /**
   * Rotate refresh token and issue new access/refresh token pairs
   */
  public async rotateRefreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
    let decoded;
    try {
      decoded = this.tokenService.verifyRefreshToken(token);
    } catch (error) {
      throw new AppError('Invalid or expired session token', 401);
    }

    // Check if token is blacklisted in Redis
    const isBlacklisted = await this.tokenService.isTokenBlacklisted(token, 'refresh');
    if (isBlacklisted) {
      throw new AppError('Token is revoked', 401);
    }

    // Look up token in Mongoose active collection
    const activeToken = await RefreshToken.findOne({ token });

    // REUSE DETECTION: If token is valid but not in database, it has been rotated and reused.
    // Someone might have stolen this token. Revoke all sessions for this user.
    if (!activeToken) {
      logger.warn(`[AuthService] Refresh token reuse detected for userId: ${decoded.userId}. Revoking all sessions.`);
      await RefreshToken.deleteMany({ userId: decoded.userId });
      throw new AppError('Session breach detected. Please login again.', 401);
    }

    // Find the associated user
    const user = await this.userRepo.findById(decoded.userId);
    if (!user) {
      throw new AppError('User session not found', 401);
    }

    // Generate new token pair
    const newAccessToken = this.tokenService.generateAccessToken({
      userId: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    });

    const newRefreshToken = this.tokenService.generateRefreshToken({
      userId: user.id,
    });

    // Delete old refresh token from DB
    await RefreshToken.deleteOne({ _id: activeToken._id });

    // Save new refresh token in DB
    const newDecoded = this.tokenService.verifyRefreshToken(newRefreshToken);
    const expiresAt = newDecoded.exp ? new Date(newDecoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      userId: user._id,
      token: newRefreshToken,
      expiresAt,
    });

    // Blacklist old refresh token in Redis for the remaining validity duration
    await this.tokenService.blacklistToken(token, 'refresh');

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /**
   * Log user out by clearing session token and status
   */
  public async logout(userId: string, token: string): Promise<void> {
    // Set offline status
    await this.userRepo.updateOnlineStatus(userId, false);

    // Delete refresh token from DB
    await RefreshToken.deleteOne({ token });

    // Blacklist token in Redis
    await this.tokenService.blacklistToken(token, 'refresh');
  }
}
