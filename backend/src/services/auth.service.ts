import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { UserDTO, JWTPayload, LoginResponseDTO } from "../types";
import { env } from "../config/env";

const JWT_SECRET = env.JWT_SECRET;
const JWT_EXPIRY = "8h";

export class AuthService {
  static async login(
    email: string,
    password: string,
  ): Promise<LoginResponseDTO> {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { department: true },
    });

    if (!user || !user.isActive) {
      throw new Error("Invalid email or password");
    }

    const isPasswordValid = await bcryptjs.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new Error("Invalid email or password");
    }

    const jwtPayload: JWTPayload = {
      sub: user.id,
      role: user.role,
      departmentId: user.departmentId,
    };

    const token = jwt.sign(jwtPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    const userDTO: UserDTO = {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      departmentCode: user.department?.code,
    };

    return { token, user: userDTO };
  }

  static verifyToken(token: string): JWTPayload {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
      return decoded;
    } catch (error) {
      throw new Error("Invalid or expired token");
    }
  }

  static async getUserById(id: string): Promise<UserDTO> {
    const user = await prisma.user.findUnique({
      where: { id },
      include: { department: true },
    });

    if (!user || !user.isActive) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      departmentId: user.departmentId,
      departmentCode: user.department?.code,
    };
  }
}
