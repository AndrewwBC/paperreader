import nodemailer from 'nodemailer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

const localDelivery = () => process.env.NODE_ENV !== 'production' && process.env.PAPER_VAULT_MAIL_DIR

export function recoveryAvailable() {
  return Boolean(localDelivery() || (process.env.SMTP_HOST && process.env.SMTP_FROM))
}

export function createMailTransport() {
  const port = Number(process.env.SMTP_PORT || 587)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  })
}

async function deliver(email, token, kind) {
  const url = new URL(process.env.APP_URL || 'http://localhost:5173')
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('APP_URL inválida')
  url.hash = `${kind === 'reset' ? 'reset' : 'verify'}=${token}`
  const subject = kind === 'reset' ? 'Redefinir senha — Paper Vault' : 'Confirme seu e-mail — Paper Vault'
  const text = kind === 'reset'
    ? `Redefina sua senha do Paper Vault:\n${url}\n\nEste link expira em 1 hora e só pode ser usado uma vez. Se você não solicitou a alteração, ignore esta mensagem.`
    : `Confirme seu e-mail no Paper Vault:\n${url}\n\nEste link expira em 24 horas e só pode ser usado uma vez. Se você não criou uma conta ou alterou seu e-mail, ignore esta mensagem.`
  if (localDelivery()) {
    await mkdir(localDelivery(), { recursive: true, mode: 0o700 })
    await writeFile(join(localDelivery(), `${randomUUID()}.txt`), `Para: ${email}\nAssunto: ${subject}\n${text}`, { mode: 0o600 })
    return
  }
  if (!recoveryAvailable()) throw new Error('SMTP não configurado')
  await createMailTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject, text })
}

export const deliverRecovery = (email, token) => deliver(email, token, 'reset')
export const deliverVerification = (email, token) => deliver(email, token, 'verify')

export async function deliverInvitation(email, token, studyName) {
  const url = new URL(process.env.APP_URL || 'http://localhost:5173')
  url.searchParams.set('invite', token)
  url.hash = ''
  const subject = 'Convite para um estudo — Paper Vault'
  const text = `Você recebeu um convite para o estudo “${studyName}” no Paper Vault.\n\nAbra o link e entre com este endereço de e-mail para aceitar:\n${url}\n\nO convite expira em 7 dias. Se não reconhecer o convite, ignore esta mensagem.`
  if (localDelivery()) {
    await mkdir(localDelivery(), { recursive: true, mode: 0o700 })
    await writeFile(join(localDelivery(), `${randomUUID()}.txt`), `Para: ${email}\nAssunto: ${subject}\n${text}`, { mode: 0o600 })
    return
  }
  if (!recoveryAvailable()) throw new Error('SMTP não configurado')
  await createMailTransport().sendMail({ from: process.env.SMTP_FROM, to: email, subject, text })
}
