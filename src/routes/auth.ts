import { Router } from 'express';
import { registro, login, loginGoogle, loginApple, appleServerNotification, refreshToken, logout } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema, loginGoogleSchema, loginAppleSchema, appleNotificationSchema, logoutSchema, refreshTokenSchema, registroSchema } from '../validators/schemas.js';

const r = Router();

r.post('/registro', validate(registroSchema), registro);
r.post('/registrar', validate(registroSchema), registro);
r.post('/login', validate(loginSchema), login);

r.post('/refresh-token', validate(refreshTokenSchema), refreshToken);
r.post('/logout', validate(logoutSchema), logout);

// login-google valida corpo aqui e valida token no controller
r.post('/login-google', validate(loginGoogleSchema), loginGoogle);

// Apple Sign In — validate body schema here, token verified inside controller
r.post('/apple', validate(loginAppleSchema), loginApple);
r.post('/apple/notifications', validate(appleNotificationSchema), appleServerNotification);
export default r;
