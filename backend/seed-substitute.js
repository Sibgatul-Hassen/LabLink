const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const ardUno = await prisma.component.findFirst({ where: { code: 'ARD-UNO-R3' } });
  const ardNano = await prisma.component.findFirst({ where: { code: 'ARD-NANO' } });
  if (ardUno && ardNano) {
    await prisma.componentSubstitute.upsert({
      where: { originalId_substituteId: { originalId: ardUno.id, substituteId: ardNano.id } },
      update: {},
      create: { originalId: ardUno.id, substituteId: ardNano.id, ratio: 1 }
    });
    console.log('Seeded: ARD-UNO-R3 -> ARD-NANO');
  } else {
    console.log('Components not found', { ardUno: !!ardUno, ardNano: !!ardNano });
  }
  await prisma.$disconnect();
}
main().catch(console.error);
