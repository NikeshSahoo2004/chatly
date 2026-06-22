import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import chatRoutes from './modules/chat/chat.routes';
import otpRoutes from './modules/OTP/otp.route';

const router = Router();

// Mount modules
router.use('/auth', authRoutes);
router.use('/otp', otpRoutes);

// Endpoint to list all registered routes in the application
// Register /routes before / chatRoutes to avoid authenticate middleware execution
router.get('/routes', (req, res) => {
  try {
    const rawRoutes = getRegisteredRoutes(req.app);
    // De-duplicate and sort routes
    const uniqueRoutes = rawRoutes
      .filter(
        (v, i, a) =>
          a.findIndex((t) => t.method === v.method && t.path === v.path) === i
      )
      .sort(
        (a, b) =>
          a.path.localeCompare(b.path) || a.method.localeCompare(b.method)
      );

    res.status(200).json({
      status: 'success',
      results: uniqueRoutes.length,
      data: { routes: uniqueRoutes },
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve registered routes',
      error: error.message,
    });
  }
});

router.use('/', chatRoutes);

/**
 * Interface representing basic details of a registered route.
 */
export interface RouteInfo {
  method: string;
  path: string;
}

/**
 * Recursively extracts all registered routes from an Express application or Router.
 * @param appOrRouter - The Express application or Router stack to walk.
 * @param parentPath - The accumulated path prefix.
 */
export function getRegisteredRoutes(
  appOrRouter: any,
  parentPath = ''
): RouteInfo[] {
  const routes: RouteInfo[] = [];
  const stack =
    appOrRouter.stack || (appOrRouter._router && appOrRouter._router.stack);

  if (!stack) {
    return routes;
  }

  stack.forEach((layer: any) => {
    if (layer.route) {
      // Direct route (e.g. router.get('/path', ...))
      const path = (parentPath + layer.route.path).replace(/\/+/g, '/');
      const methods = Object.keys(layer.route.methods).map((m) =>
        m.toUpperCase()
      );
      methods.forEach((method) => {
        routes.push({ method, path });
      });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      // Nested router (e.g. router.use('/subpath', subRouter))
      let routerPath = '';
      if (layer.regexp) {
        const regexpSource = layer.regexp.source;
        let match = regexpSource;
        if (match.includes('(?=')) {
          match = match.split('(?=')[0];
        }
        match = match
          .replace(/\(\?:\\\/\|\$\)$/, '')
          .replace(/\(\?=\\\/\|\$\)$/, '')
          .replace(/\\\/\\?\??$/, '')
          .replace(/^\^/, '')
          .replace(/\\\//g, '/');

        if (match === '/' || match === '//' || match === '') {
          routerPath = '';
        } else {
          routerPath = match.startsWith('/') ? match : '/' + match;
        }
      }
      routes.push(
        ...getRegisteredRoutes(layer.handle, parentPath + routerPath)
      );
    }
  });

  return routes;
}

export default router;
