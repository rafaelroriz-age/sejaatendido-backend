import { prisma } from './utils/prisma.js';
import bcrypt from 'bcryptjs';
async function run(){ 
  const admin = await prisma.usuario.upsert({ where:{ email:'admin@seja.com' }, update:{}, create:{ nome:'Admin', email:'admin@seja.com', senhaHash: await bcrypt.hash('admin123',10), tipo:'ADMIN' }});
  const med = await prisma.usuario.upsert({ where:{ email:'medico@seja.com' }, update:{}, create:{ nome:'Dra. Ana', email:'medico@seja.com', senhaHash: await bcrypt.hash('medico123',10), tipo:'MEDICO' }});
  await prisma.medico.upsert({ where:{ usuarioId: med.id }, update:{}, create:{ usuarioId: med.id, crm:'1234', especialidades:['clinico geral'], aprovado:true }});
  const pac = await prisma.usuario.upsert({ where:{ email:'paciente@seja.com' }, update:{}, create:{ nome:'Joao', email:'paciente@seja.com', senhaHash: await bcrypt.hash('paciente123',10), tipo:'PACIENTE' }});
  await prisma.paciente.upsert({ where:{ usuarioId: pac.id }, update:{}, create:{ usuarioId: pac.id }});
  console.log('seed done'); process.exit(0);
}
run().catch(e=>{ console.error(e); process.exit(1); });
