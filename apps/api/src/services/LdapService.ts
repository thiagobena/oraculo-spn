import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Client } from 'ldapts';
import { prisma } from '../db/prisma.js';

const execFileAsync = promisify(execFile);

export interface LdapUserResult {
  username: string;
  displayName: string;
  email?: string;
  groups: string[];
}

export interface ADConfig {
  ad_enabled: boolean;
  ad_url: string;
  ad_domain: string;
  ad_base_dn: string;
  ad_bind_dn?: string;
  ad_bind_password?: string;
  ad_search_filter: string;
  ad_admin_group?: string;
}

export class LdapService {
  /**
   * Obtém as configurações do Active Directory salvas no banco de dados.
   */
  static async getADConfig(): Promise<ADConfig> {
    const settings = await prisma.appSetting.findMany({
      where: {
        key: {
          in: [
            'ad_enabled',
            'ad_url',
            'ad_domain',
            'ad_base_dn',
            'ad_bind_dn',
            'ad_bind_password',
            'ad_search_filter',
            'ad_admin_group',
          ],
        },
      },
    });

    const configMap = new Map<string, string>();
    for (const s of settings) {
      configMap.set(s.key, s.value);
    }

    return {
      ad_enabled: configMap.get('ad_enabled') !== 'false',
      ad_url: configMap.get('ad_url') || 'ldaps://svr-ad-01.spn.local:636',
      ad_domain: configMap.get('ad_domain') || 'spn.local',
      ad_base_dn: configMap.get('ad_base_dn') || 'DC=spn,DC=local',
      ad_bind_dn: configMap.get('ad_bind_dn') || '',
      ad_bind_password: configMap.get('ad_bind_password') || '',
      ad_search_filter: configMap.get('ad_search_filter') || '(sAMAccountName={{username}})',
      ad_admin_group: configMap.get('ad_admin_group') || '',
    };
  }

  /**
   * Autenticação Nativa via Windows PrincipalContext (SSPI / WinAuth) para redes Windows AD.
   */
  private static async authenticateWin32(username: string, password: string, domain: string): Promise<LdapUserResult | null> {
    if (process.platform !== 'win32') return null;

    const targetDomain = domain || 'spn.local';

    const psScript = `
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.DirectoryServices
      Add-Type -AssemblyName System.DirectoryServices.AccountManagement

      $u = $env:AD_AUTH_USER
      $p = $env:AD_AUTH_PASS
      $d = $env:AD_AUTH_DOMAIN
      $dcIP = '192.168.254.109'

      $userFormats = @($u, "$u@$d", "$d\\$u", "SPN\\$u")
      $dcTargets = @($dcIP, $d, 'svr-ad-01.spn.local', 'SPN')

      $isValid = $false
      $displayName = $u
      $email = ''
      $groups = @()

      # 1. Tentar busca via DirectoryEntry com Win32 Secure SSPI
      foreach ($target in $dcTargets) {
        if ($isValid) { break }
        foreach ($fmt in $userFormats) {
          try {
            $path = "LDAP://$target"
            $de = New-Object System.DirectoryServices.DirectoryEntry($path, $fmt, $p, [System.DirectoryServices.AuthenticationTypes]::Secure)
            $ds = New-Object System.DirectoryServices.DirectorySearcher($de)
            $ds.Filter = "(sAMAccountName=$u)"
            $ds.SizeLimit = 1
            $res = $ds.FindOne()
            if ($res) {
              $isValid = $true
              if ($res.Properties['displayname'] -and $res.Properties['displayname'].Count -gt 0) {
                $displayName = [string]$res.Properties['displayname'][0]
              }
              if ($res.Properties['mail'] -and $res.Properties['mail'].Count -gt 0) {
                $email = [string]$res.Properties['mail'][0]
              }
              if ($res.Properties['memberof']) {
                foreach ($g in $res.Properties['memberof']) {
                  $groups += [string]$g
                }
              }
              break
            }
          } catch {}
        }
      }

      # 2. Fallback via PrincipalContext
      if (-not $isValid) {
        foreach ($target in $dcTargets) {
          if ($isValid) { break }
          try {
            $pc = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Domain, $target)
            foreach ($fmt in $userFormats) {
              if ($pc.ValidateCredentials($fmt, $p)) {
                $isValid = $true
                try {
                  $userObj = [System.DirectoryServices.AccountManagement.UserPrincipal]::FindByIdentity($pc, $u)
                  if ($userObj) {
                    if ($userObj.DisplayName) { $displayName = [string]$userObj.DisplayName }
                    if ($userObj.EmailAddress) { $email = [string]$userObj.EmailAddress }
                    $userObj.GetGroups() | ForEach-Object { $groups += [string]$_.Name }
                  }
                } catch {}
                break
              }
            }
          } catch {}
        }
      }

      if ($isValid) {
        $jsonRes = @{ success = $true; displayName = $displayName; email = $email; groups = $groups } | ConvertTo-Json -Compress
        Write-Output "JSON_START:$($jsonRes):JSON_END"
      } else {
        $jsonRes = @{ success = $false; error = 'Credenciais inválidas' } | ConvertTo-Json -Compress
        Write-Output "JSON_START:$($jsonRes):JSON_END"
      }
    `;

    const encodedScript = Buffer.from(psScript, 'utf-16le').toString('base64');

    try {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-EncodedCommand', encodedScript], {
        env: {
          ...process.env,
          AD_AUTH_USER: username,
          AD_AUTH_PASS: password,
          AD_AUTH_DOMAIN: targetDomain,
        },
      });

      const match = stdout.match(/JSON_START:(.*?):JSON_END/s);
      if (match && match[1]) {
        const result = JSON.parse(match[1]);
        if (result.success) {
          console.log(`✅ [Win32 Native AD] Usuário "${username}" autenticado com sucesso no domínio "${targetDomain}"`);
          return {
            username,
            displayName: result.displayName || username,
            email: result.email || undefined,
            groups: Array.isArray(result.groups) ? result.groups : (result.groups ? [result.groups] : []),
          };
        } else if (result.error && result.error !== 'Credenciais inválidas') {
          console.warn(`⚠️ [Win32 Native AD] Retorno do PowerShell:`, result.error);
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Execução de autenticação nativa Win32 indisponível:', err.message);
    }
    return null;
  }

  /**
   * Autentica o usuário no Active Directory (com suporte a Win32 Native SSPI + Fallback LDAP).
   */
  static async authenticate(username: string, password: string): Promise<LdapUserResult> {
    const config = await this.getADConfig();

    if (!config.ad_enabled) {
      throw new Error('A autenticação via Active Directory está desativada no sistema.');
    }

    if (!username || !password) {
      throw new Error('Usuário e senha são obrigatórios.');
    }

    let cleanUsername = username.trim().toLowerCase();
    if (cleanUsername.includes('@')) {
      cleanUsername = cleanUsername.split('@')[0];
    } else if (cleanUsername.includes('\\')) {
      cleanUsername = cleanUsername.split('\\')[1];
    }

    // 1. Tentar validação nativa do Windows Active Directory (PrincipalContext)
    const win32User = await this.authenticateWin32(cleanUsername, password, config.ad_domain);
    if (win32User) {
      return win32User;
    }

    // 2. Fallback: Autenticação via busca LDAP em Service Account
    if (config.ad_bind_dn && config.ad_bind_password && config.ad_base_dn) {
      try {
        const adminClient = new Client({
          url: config.ad_url,
          timeout: 8000,
          connectTimeout: 8000,
          tlsOptions: { rejectUnauthorized: false },
        });

        await adminClient.bind(config.ad_bind_dn, config.ad_bind_password);

        const filter = `(|(sAMAccountName=${cleanUsername})(userPrincipalName=${cleanUsername}@${config.ad_domain}))`;
        const { searchEntries } = await adminClient.search(config.ad_base_dn, {
          scope: 'sub',
          filter,
          attributes: ['dn', 'displayName', 'cn', 'sAMAccountName', 'mail', 'userPrincipalName', 'memberOf'],
        });

        await adminClient.unbind();

        if (searchEntries && searchEntries.length > 0) {
          const entry = searchEntries[0];
          const userDN = entry.dn || (entry.userPrincipalName as string);

          if (userDN) {
            const userClient = new Client({
              url: config.ad_url,
              timeout: 8000,
              connectTimeout: 8000,
              tlsOptions: { rejectUnauthorized: false },
            });

            await userClient.bind(userDN, password);
            await userClient.unbind();

            const groups: string[] = [];
            if (entry.memberOf) {
              const rawMembers = Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf];
              for (const m of rawMembers) {
                if (typeof m === 'string') groups.push(m);
              }
            }

            return {
              username: cleanUsername,
              displayName: (entry.displayName as string) || (entry.cn as string) || cleanUsername,
              email: (entry.mail as string) || (entry.userPrincipalName as string) || undefined,
              groups,
            };
          }
        }
      } catch (svcErr) {
        console.warn('⚠️ Busca via Service Account LDAP não concluiu:', svcErr);
      }
    }

    // 3. Fallback: Bind direto LDAP com lista de UPNs candidatas
    const targetDomain = config.ad_domain || 'spn.local';
    const bindCandidates = [
      `${cleanUsername}@${targetDomain}`,
      `${targetDomain}\\${cleanUsername}`,
      cleanUsername,
    ];

    let lastError: any = null;

    for (const bindDN of bindCandidates) {
      const client = new Client({
        url: config.ad_url,
        timeout: 8000,
        connectTimeout: 8000,
        tlsOptions: { rejectUnauthorized: false },
      });

      try {
        await client.bind(bindDN, password);

        let displayName = cleanUsername;
        let email: string | undefined = undefined;
        const groups: string[] = [];

        if (config.ad_base_dn) {
          try {
            const filter = config.ad_search_filter.replace(/\{\{username\}\}/g, cleanUsername);
            const { searchEntries } = await client.search(config.ad_base_dn, {
              scope: 'sub',
              filter,
              attributes: ['displayName', 'cn', 'sAMAccountName', 'mail', 'userPrincipalName', 'memberOf'],
            });

            if (searchEntries && searchEntries.length > 0) {
              const entry = searchEntries[0];
              displayName = (entry.displayName as string) || (entry.cn as string) || cleanUsername;
              email = (entry.mail as string) || (entry.userPrincipalName as string) || undefined;

              if (entry.memberOf) {
                const rawMembers = Array.isArray(entry.memberOf) ? entry.memberOf : [entry.memberOf];
                for (const m of rawMembers) {
                  if (typeof m === 'string') groups.push(m);
                }
              }
            }
          } catch (_) {}
        }

        await client.unbind();

        console.log(`✅ [LDAP Direct] Bind efetuado com sucesso usando ${bindDN}`);
        return {
          username: cleanUsername,
          displayName,
          email,
          groups,
        };
      } catch (err: any) {
        lastError = err;
        try {
          await client.unbind();
        } catch (_) {}
      }
    }

    console.error(`❌ Falha de autenticação AD para o usuário "${cleanUsername}":`, lastError?.message || 'Senha incorreta');
    throw new Error(`Autenticação no Active Directory falhou. Verifique se o usuário "${cleanUsername}" e a senha do AD estão corretos.`);
  }

  /**
   * Testa a conectividade e configurações com o servidor AD/LDAP.
   */
  static async testConnection(config: ADConfig): Promise<{ success: boolean; message: string; userCount?: number }> {
    const domain = config.ad_domain || 'spn.local';

    if (process.platform === 'win32') {
      try {
        const psScript = `
          Add-Type -AssemblyName System.DirectoryServices.AccountManagement
          $pc = New-Object System.DirectoryServices.AccountManagement.PrincipalContext([System.DirectoryServices.AccountManagement.ContextType]::Domain, '${domain}')
          if ($pc.ConnectedServer) {
            Write-Output "CONNECTED:$($pc.ConnectedServer)"
          } else {
            Write-Output "FAILED"
          }
        `;
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', psScript]);
        if (stdout.includes('CONNECTED:')) {
          const dcServer = stdout.split('CONNECTED:')[1].trim();
          return {
            success: true,
            message: `Conexão efetuada com sucesso ao Active Directory no domínio ${domain} (Servidor: ${dcServer})!`,
            userCount: 1,
          };
        }
      } catch (e: any) {
        console.warn('⚠️ Teste de conexão Win32 falhou, tentando socket LDAP:', e.message);
      }
    }

    if (!config.ad_url) {
      throw new Error('URL do Active Directory é obrigatória.');
    }

    const client = new Client({
      url: config.ad_url,
      timeout: 8000,
      connectTimeout: 8000,
      tlsOptions: { rejectUnauthorized: false },
    });

    try {
      if (config.ad_bind_dn && config.ad_bind_password) {
        await client.bind(config.ad_bind_dn, config.ad_bind_password);
      } else {
        await client.bind('', '');
      }

      let userCount = 0;
      if (config.ad_base_dn) {
        const { searchEntries } = await client.search(config.ad_base_dn, {
          scope: 'sub',
          filter: '(objectClass=user)',
          sizeLimit: 5,
        });
        userCount = searchEntries.length;
      }

      await client.unbind();

      return {
        success: true,
        message: `Conexão efetuada com sucesso ao AD (${config.ad_url})!`,
        userCount,
      };
    } catch (err: any) {
      try {
        await client.unbind();
      } catch (_) {}
      throw new Error(`Falha ao conectar no AD (${config.ad_url}): ${err?.message || 'Servidor inacessível'}`);
    }
  }

  /**
   * Busca contas de usuários no Banco Local e no Active Directory (PowerShell/LDAP) para autocomplete inteligente.
   */
  static async searchUsers(query: string): Promise<Array<{ username: string; displayName: string; email?: string }>> {
    const cleanQuery = query.trim().toLowerCase();
    if (cleanQuery.length < 3) return [];

    const resultsMap = new Map<string, { username: string; displayName: string; email?: string }>();

    // 1. Busca no Banco de Dados local
    try {
      const dbUsers = await prisma.user.findMany({
        where: {
          is_active: true,
          OR: [
            { username: { contains: cleanQuery } },
            { display_name: { contains: cleanQuery } },
            { email: { contains: cleanQuery } },
          ],
        },
        take: 5,
      });

      for (const u of dbUsers) {
        resultsMap.set(u.username.toLowerCase(), {
          username: u.username,
          displayName: u.display_name,
          email: u.email || undefined,
        });
      }
    } catch (dbErr) {
      console.warn('⚠️ Erro ao buscar usuários no DB local:', dbErr);
    }

    // 2. Busca no Active Directory via Win32 DirectorySearcher
    if (process.platform === 'win32') {
      try {
        const psScript = `
          $ErrorActionPreference = 'SilentlyContinue'
          Add-Type -AssemblyName System.DirectoryServices
          Add-Type -AssemblyName System.DirectoryServices.AccountManagement

          $q = $env:AD_SEARCH_Q
          $dcIP = '192.168.254.109'
          $dcTargets = @($dcIP, 'spn.local', 'svr-ad-01.spn.local', 'SPN')

          $foundList = @()

          foreach ($target in $dcTargets) {
            if ($foundList.Count -ge 5) { break }
            try {
              $path = "LDAP://$target"
              $de = New-Object System.DirectoryServices.DirectoryEntry($path)
              $ds = New-Object System.DirectoryServices.DirectorySearcher($de)
              $ds.Filter = "(&(objectCategory=person)(objectClass=user)(!(userAccountControl:1.2.840.113556.1.4.803:=2))(|(sAMAccountName=*$q*)(displayName=*$q*)(mail=*$q*)))"
              $ds.SizeLimit = 5
              $searchResults = $ds.FindAll()
              foreach ($res in $searchResults) {
                $uName = ''
                $dName = ''
                $mail = ''
                if ($res.Properties['samaccountname'] -and $res.Properties['samaccountname'].Count -gt 0) { $uName = [string]$res.Properties['samaccountname'][0] }
                if ($res.Properties['displayname'] -and $res.Properties['displayname'].Count -gt 0) { $dName = [string]$res.Properties['displayname'][0] }
                if ($res.Properties['mail'] -and $res.Properties['mail'].Count -gt 0) { $mail = [string]$res.Properties['mail'][0] }
                if ($uName) {
                  $foundList += @{
                    username = $uName
                    displayName = if ($dName) { $dName } else { $uName }
                    email = $mail
                  }
                }
              }
            } catch {}
          }

          if ($foundList.Count -gt 0) {
            $jsonRes = $foundList | ConvertTo-Json -Compress
            Write-Output "JSON_START:$($jsonRes):JSON_END"
          }
        `;

        const encodedScript = Buffer.from(psScript, 'utf-16le').toString('base64');
        const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-EncodedCommand', encodedScript], {
          env: {
            ...process.env,
            AD_SEARCH_Q: cleanQuery,
          },
          timeout: 2500,
        });

        const match = stdout.match(/JSON_START:(.*?):JSON_END/s);
        if (match && match[1]) {
          const parsed = JSON.parse(match[1]);
          const items = Array.isArray(parsed) ? parsed : [parsed];
          for (const item of items) {
            if (item.username) {
              const uKey = String(item.username).toLowerCase();
              if (!resultsMap.has(uKey)) {
                resultsMap.set(uKey, {
                  username: String(item.username),
                  displayName: String(item.displayName || item.username),
                  email: item.email ? String(item.email) : undefined,
                });
              }
            }
          }
        }
      } catch (adErr: any) {
        // Silencioso se AD estiver offline ou dar timeout
      }
    }

    return Array.from(resultsMap.values()).slice(0, 5);
  }
}

