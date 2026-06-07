import { TokenPayload } from '../services/token.service';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}
export {};
