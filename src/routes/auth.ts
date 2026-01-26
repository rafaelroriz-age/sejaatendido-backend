import { Router } from 'express';
import { registro, login, loginGoogle, refreshToken, logout } from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema, loginGoogleSchema, logoutSchema, refreshTokenSchema, registroSchema } from '../validators/schemas.js';

const r = Router();

r.post('/registro', validate(registroSchema), registro);
r.post('/registrar', validate(registroSchema), registro);
r.post('/login', validate(loginSchema), login);

r.post('/refresh-token', validate(refreshTokenSchema), refreshToken);
r.post('/logout', validate(logoutSchema), logout);

// login-google valida corpo aqui e valida token no controller
r.post('/login-google', validate(loginGoogleSchema), loginGoogle);
export default r;
