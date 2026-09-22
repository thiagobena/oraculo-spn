import { prisma } from '../db/prisma.js';
import { LdapService, LdapUserResult } from './LdapService.js';

export interface UserAuthResult {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  role: 'USUARIO' | 'ADMINISTRADOR';
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class AuthService {
  /**
   * Realiza login do usuário via AD e faz o provisionamento JIT no banco de dados.
   */
  static async login(username: string, password: string): Promise<UserAuthResult> {
    const cleanUsername = username.trim().toLowerCase();

    // 1. Efetuar bind e autenticação no Active Directory
    const ldapUser: LdapUserResult = await LdapService.authenticate(cleanUsername, password);
    const config = await LdapService.getADConfig();

    // 2. Verificar se o usuário já existe na base de dados
    let user = await prisma.user.findUnique({
      where: { username: cleanUsername },
    });

    const isInitialAdmin = cleanUsername === 'thiago.bena';
    
    // Verificar pertencimento ao grupo do AD para concessão automática de Admin
    let isAdGroupAdmin = false;
    if (config.ad_admin_group && ldapUser.groups && ldapUser.groups.length > 0) {
      const targetGroup = config.ad_admin_group.toLowerCase();
      isAdGroupAdmin = ldapUser.groups.some(g => g.toLowerCase().includes(targetGroup));
    }

    if (!user) {
      // Provisionamento JIT (Primeiro acesso)
      const initialRole = (isInitialAdmin || isAdGroupAdmin) ? 'ADMINISTRADOR' : 'USUARIO';

      user = await prisma.user.create({
        data: {
          username: cleanUsername,
          display_name: ldapUser.displayName || cleanUsername,
          email: ldapUser.email || null,
          role: initialRole,
          is_active: true,
          last_login_at: new Date(),
        },
      });

      console.log(`👤 [JIT] Novo usuário provisionado via AD: ${cleanUsername} (${user.role})`);
    } else {
      // Usuário existente - Verificar se está ativo
      if (!user.is_active) {
        throw new Error('Sua conta está desativada no Oráculo SPN. Entre em contato com um administrador.');
      }

      // Garantir role de Admin para thiago.bena ou grupo AD
      let updatedRole = user.role;
      if (isInitialAdmin || isAdGroupAdmin) {
        updatedRole = 'ADMINISTRADOR';
      }

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          display_name: ldapUser.displayName || user.display_name,
          email: ldapUser.email || user.email,
          role: updatedRole,
          last_login_at: new Date(),
        },
      });
    }

    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      email: user.email,
      role: user.role as 'USUARIO' | 'ADMINISTRADOR',
      is_active: user.is_active,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }

  /**
   * Obtém os detalhes de um usuário por ID.
   */
  static async getUserById(userId: string): Promise<UserAuthResult | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      email: user.email,
      role: user.role as 'USUARIO' | 'ADMINISTRADOR',
      is_active: user.is_active,
      last_login_at: user.last_login_at,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}
