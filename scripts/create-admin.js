/**
 * Admin kullanıcısı oluşturur (şifre bcrypt ile hashlenir).
 *
 *   npm run admin:create                                          (etkileşimli)
 *   ADMIN_USERNAME=dilek ADMIN_PASSWORD=... npm run admin:create   (etkileşimsiz)
 *
 * Etkileşimsiz mod: ADMIN_PASSWORD verildiğinde veya terminal yokken devreye
 * girer; sorulmayan isteğe bağlı alanlar (ad soyad, e-posta) boş bırakılır.
 *
 * Kullanıcı zaten varsa şifresini günceller.
 */
require('dotenv').config();
const { Writable } = require('stream');
const readline = require('readline');
const db = require('../config/db');
const userModel = require('../models/user');

// Terminal yoksa soru soramayız; ADMIN_PASSWORD verildiyse zaten sormamalıyız.
const NON_INTERACTIVE = Boolean(process.env.ADMIN_PASSWORD) || !process.stdin.isTTY;

/** Şifre yazılırken ekrana basılmasını engelleyen çıkış akışı. */
function createMutableOutput() {
  const out = new Writable({
    write(chunk, encoding, callback) {
      if (!out.muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  out.muted = false;
  return out;
}

function ask(question, { hidden = false } = {}) {
  const output = createMutableOutput();
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

  return new Promise((resolve, reject) => {
    let answered = false;

    // stdin kapanırsa (ör. < /dev/null) soru asla cevaplanmaz; sessizce
    // takılmak yerine anlaşılır hata verelim.
    rl.on('close', () => {
      if (!answered) reject(new Error('Girdi okunamadı. Etkileşimsiz çalıştırmak için ADMIN_* değişkenlerini kullanın.'));
    });

    rl.question(question, (answer) => {
      answered = true;
      output.muted = false;
      if (hidden) process.stdout.write('\n');
      rl.close();
      resolve(answer.trim());
    });
    output.muted = hidden;
  });
}

/** Önce ortam değişkeni, sonra (mümkünse) soru, değilse varsayılan. */
async function resolveField(envName, question, fallback = '') {
  if (process.env[envName] !== undefined) return process.env[envName].trim();
  if (NON_INTERACTIVE) return fallback;
  return ask(question);
}

async function main() {
  let username = (process.env.ADMIN_USERNAME || '').trim();
  if (!username) {
    if (NON_INTERACTIVE) throw new Error('ADMIN_USERNAME belirtilmedi.');
    username = await ask('Kullanıcı adı: ');
  }
  if (!username) throw new Error('Kullanıcı adı boş olamaz.');

  const existing = await userModel.findByUsername(username);

  const fullName = existing
    ? existing.full_name
    : await resolveField('ADMIN_FULLNAME', 'Ad soyad (boş geçilebilir): ');

  const email = existing
    ? existing.email
    : await resolveField('ADMIN_EMAIL', 'E-posta (boş geçilebilir): ');

  let password = process.env.ADMIN_PASSWORD;
  if (password === undefined) {
    if (NON_INTERACTIVE) throw new Error('ADMIN_PASSWORD belirtilmedi.');
    password = await ask('Şifre: ', { hidden: true });
    const again = await ask('Şifre (tekrar): ', { hidden: true });
    if (again !== password) throw new Error('Şifreler eşleşmedi.');
  }
  if (!password || password.length < 8) throw new Error('Şifre en az 8 karakter olmalı.');

  if (existing) {
    await userModel.updatePassword(existing.id, password);
    console.log(`✓ "${username}" kullanıcısının şifresi güncellendi.`);
  } else {
    const id = await userModel.create({
      username,
      fullName: fullName || null,
      email: email || null,
      password,
    });
    console.log(`✓ Admin kullanıcısı oluşturuldu (id: ${id}, kullanıcı adı: ${username}).`);
  }

  console.log('Giriş adresi: /admin/giris');
}

main()
  .catch((err) => {
    console.error('Hata:', err.message);
    process.exitCode = 1;
  })
  .finally(() => {
    try {
      db.close();
    } catch (_) {
      /* yoksay */
    }
  });
