import { Router } from 'express';
import { registro, login, loginGoogle } from '../controllers/auth.controller';
import { validate } from '../middlewares/validate.middleware';
import { loginSchema, loginGoogleSchema, registroSchema } from '../validators/schemas';

const r = Router();

r.post('/registro', validate(registroSchema), registro);
r.post('/login', validate(loginSchema), login);

// login-google valida corpo aqui e valida token no controller
r.post('/login-google', validate(loginGoogleSchema), loginGoogle);
export default r;
