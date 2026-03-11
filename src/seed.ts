import { prisma } from './utils/prisma.js';
import bcrypt from 'bcryptjs';
async function run(){ 
  const ADMIN_PASSWORD = 'Admin@123456';
  const MEDICO_PASSWORD = 'Medico@123456';
  const PACIENTE_PASSWORD = 'Paciente@123456';

  const admin = await prisma.usuario.upsert({ where:{ email:'admin@seja.com' }, update:{}, create:{ nome:'Admin', email:'admin@seja.com', senhaHash: await bcrypt.hash(ADMIN_PASSWORD,10), tipo:'ADMIN' }});
  const med = await prisma.usuario.upsert({ where:{ email:'medico@seja.com' }, update:{}, create:{ nome:'Dra. Ana', email:'medico@seja.com', senhaHash: await bcrypt.hash(MEDICO_PASSWORD,10), tipo:'MEDICO' }});
  await prisma.medico.upsert({ where:{ usuarioId: med.id }, update:{}, create:{ usuarioId: med.id, crm:'1234', especialidades:['clinico geral'], aprovado:true }});
  const pac = await prisma.usuario.upsert({ where:{ email:'paciente@seja.com' }, update:{}, create:{ nome:'Joao', email:'paciente@seja.com', senhaHash: await bcrypt.hash(PACIENTE_PASSWORD,10), tipo:'PACIENTE' }});
  await prisma.paciente.upsert({ where:{ usuarioId: pac.id }, update:{}, create:{ usuarioId: pac.id }});
  console.log('seed done');
  if (process.env.NODE_ENV !== 'production') {
    console.log('Credentials (dev only):');
    console.log('admin@seja.com /', ADMIN_PASSWORD);
    console.log('medico@seja.com /', MEDICO_PASSWORD);
    console.log('paciente@seja.com /', PACIENTE_PASSWORD);
  }
  process.exit(0);
}
run().catch(e=>{ console.error(e); process.exit(1); });
