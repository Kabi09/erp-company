import { Router } from 'express';
import { adminRouter } from './admin.routes';
import { authRouter } from './auth.routes';
import { logisticsRouter } from './logistics.routes';
import { productionRouter } from './production.routes';
import { salesRouter } from './sales.routes';
import { supplyChainRouter } from './supply-chain.routes';

export const apiRouter = Router();

apiRouter.use(authRouter);
apiRouter.use(salesRouter);
apiRouter.use(supplyChainRouter);
apiRouter.use(productionRouter);
apiRouter.use(logisticsRouter);
apiRouter.use(adminRouter);

export default apiRouter;
