import bcrypt from 'bcryptjs';
import { departmentDemoAccounts } from '../../../shared/departmentDemoAccounts';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { env } from '../config/environment';
import { CompanySettingsModel, EmployeeModel } from '../models/auth.model';
import { registerDepartmentRoles } from '../services/departmentRoles';

async function seedDepartmentDemoAccounts() {
  if (env.isProd || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.mongoUri).hostname)) {
    throw new Error('These demo logins require a local development database.');
  }
  await connectDatabase();
  try {
    if (!(await CompanySettingsModel.exists({ id: 'company', demoMode: true }))) {
      throw new Error('Demo accounts require a workspace with demo mode enabled.');
    }
    await registerDepartmentRoles();
    for (const { label, email, roleId, department, employeeId } of departmentDemoAccounts) {
      const result = await EmployeeModel.updateOne(
        { id: employeeId, email, employeeId },
        {
          $setOnInsert: {
            id: employeeId,
            employeeId,
            email,
            department,
            roleId,
            name: label + ' (Demo)',
            designation: label,
            status: 'Active',
            passwordHash: await bcrypt.hash('cryo123', 10),
          },
        },
        { upsert: true, runValidators: true, timestamps: { createdAt: true, updatedAt: false } },
      );
      console.log(label, result.upsertedCount ? 'created' : 'already exists');
    }
  } finally {
    await disconnectDatabase();
  }
}

seedDepartmentDemoAccounts().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
