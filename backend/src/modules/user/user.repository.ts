import { User } from './user.model';
import { IUser } from './user.interface';

export class UserRepository {
  async create(userData: Partial<IUser>): Promise<IUser> {
    return User.create(userData);
  }

  async findByEmail(email: string): Promise<IUser | null> {
    // Return all fields including password explicitly for auth comparison
    return User.findOne({ email }).select('+password');
  }

  async findByUsername(username: string): Promise<IUser | null> {
    return User.findOne({ username }).select('+password');
  }

  async findById(id: string): Promise<IUser | null> {
    return User.findById(id);
  }

  async update(id: string, updateData: Partial<IUser>): Promise<IUser | null> {
    return User.findByIdAndUpdate(id, updateData, { new: true });
  }

  async updateOnlineStatus(id: string, isOnline: boolean): Promise<IUser | null> {
    return User.findByIdAndUpdate(
      id,
      { 
        isOnline, 
        lastSeen: new Date() 
      },
      { new: true }
    );
  }
}
