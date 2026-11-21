import { Router } from 'express';
import { adminRouter } from './admin.routes';
import { approvalRouter } from './approval.routes';
import { authRouter } from './auth.routes';
import { documentRouter } from './document.routes';
import { fileRouter } from './file.routes';
import { logisticsRouter } from './logistics.routes';
import { notificationRouter } from './notification.routes';
import { productionRouter } from './production.routes';
import { rdRouter } from './rd.routes';
import { reportRouter } from './report.routes';
import { salesRouter } from './sales.routes';
import { searchRouter } from './search.routes';
import { serviceRouter } from './service.routes';
import { supplyChainRouter } from './supply-chain.routes';
import { trackingRouter } from './tracking.routes';

export const apiRouter = Router();

apiRouter.use(authRouter);
apiRouter.use(salesRouter);
apiRouter.use(supplyChainRouter);
apiRouter.use(productionRouter);
apiRouter.use(logisticsRouter);
apiRouter.use(serviceRouter);
apiRouter.use(rdRouter);
apiRouter.use(adminRouter);
apiRouter.use(approvalRouter);
apiRouter.use(trackingRouter);
apiRouter.use(notificationRouter);
apiRouter.use(documentRouter);
apiRouter.use(fileRouter);
apiRouter.use(searchRouter);
apiRouter.use(reportRouter);

export default apiRouter;
