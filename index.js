require('dotenv').config();

const {
  Client,
  Events,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

const { TOKEN, CANAL_ID } = process.env;
const ESTADO = path.join(__dirname, 'anuncio_estado.json');
const LOGO = path.join(__dirname, 'logo.png');

if (!TOKEN || !CANAL_ID) {
  console.error('Faltan TOKEN o CANAL_ID en tu archivo .env.');
  process.exit(1);
}

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

bot.once(Events.ClientReady, async () => {
  console.log(`Conectado como ${bot.user.tag}`);

   // Evitar duplicar la publicidad en Railway
  if (process.env.ANUNCIO_YA_PUBLICADO === 'true') {
    console.log('✅ Publicidad ya publicada. No se enviará otra vez.');
    return;
  }

  // Evitar duplicados en la computadora
  if (fs.existsSync(ESTADO)) {
    const registro = fs.readFileSync(ESTADO, 'utf8');
    console.log('Ya existe un registro del anuncio; no se enviará otra vez.');
    console.log(registro);
    return;
  }

  try {
    const canal = await bot.channels.fetch(CANAL_ID);
    if (!canal || !canal.isTextBased() || typeof canal.send !== 'function') {
      throw new Error('CANAL_ID no corresponde a un canal de texto en el que se pueda publicar.');
    }
    if (!fs.existsSync(LOGO)) {
      throw new Error('Falta el archivo logo.png junto a index.js.');
    }

    const embed = new EmbedBuilder()
      .setColor('#315FF4')
      .setTitle('✅ /9 GNG — Free Fire')
      .setDescription([
        'Potencia tu experiencia en Free Fire con nuestros servicios para emulador y móvil.',
        '',
        'Trabajamos con sensibilidades, configuraciones, optimizaciones y modificaciones, además de muchos otros productos y servicios.',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '🎯 **Servicios principales:**',
        '• Sensibilidades para Free Fire',
        '• Configuraciones personalizadas',
        '• Ajustes para emulador',
        '• Ajustes para móvil',
        '• Modificaciones y mejoras',
        '• Optimización de rendimiento',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '🛒 **También vendemos:**',
        '• Cuentas',
        '• Accesos',
        '• Recursos digitales',
        '• Productos exclusivos',
        '• Y más servicios adicionales',
        '',
        '━━━━━━━━━━━━━━━━━━',
        '',
        '📩 **¿Te interesa?**',
        'Escríbenos por DM o abre un ticket para recibir información, precios y disponibilidad.',
        '',
        '🔥 **/9 GNG OFICIAL**',
        'Calidad, atención y confianza.',
      ].join('\n'))
      .setImage('attachment://logo.png');

    // Se registra antes del envío para evitar un duplicado si hay un
    // corte justo después de que Discord recibe el mensaje.
    fs.writeFileSync(ESTADO, JSON.stringify({
      estado: 'pendiente',
      canalId: CANAL_ID,
      fecha: new Date().toISOString(),
    }, null, 2), { flag: 'wx' });

    try {
      const mensaje = await canal.send({
        embeds: [embed],
        files: [new AttachmentBuilder(LOGO, { name: 'logo.png' })],
      });
      fs.writeFileSync(ESTADO, JSON.stringify({
        estado: 'publicado',
        canalId: CANAL_ID,
        mensajeId: mensaje.id,
        fecha: new Date().toISOString(),
      }, null, 2));
      console.log('✅ Anuncio publicado una sola vez. ID:', mensaje.id);
    } catch (error) {
      console.error('No se pudo confirmar el envío:', error.message);
      console.error('Revisa el canal antes de borrar anuncio_estado.json: quizá sí se publicó.');
    }
  } catch (error) {
    console.error('❌ No se publicó el anuncio:', error.message);
  }
});


// ============================================================
// /9 BOT — Comandos de staff. Prefijo !, en cualquier canal de texto.
// El evento del anuncio de arriba se conserva íntegro.
// ============================================================
const PREFIX = '!';
const TICKET_STAFF_ROLE_ID = '1550548178766659607';
const VERDE = 0x57F287;
const ROJO = 0xED4245;
const AZUL = 0x5865F2;
const AMARILLO = 0xFEE75C;
const MAX_DURACION_MS = 7 * 24 * 60 * 60 * 1000;

// Railway: monta un volumen en /app/data para conservar vencimientos
// entre reinicios. Fuera de Railway, usa la carpeta del proyecto.
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH || __dirname;
const VOZ_ESTADO = path.join(DATA_DIR, 'canales_temporales.json');
const SIN_VOLUMEN = Boolean(
  process.env.RAILWAY_ENVIRONMENT_ID && !process.env.RAILWAY_VOLUME_MOUNT_PATH
);
let canalesTemporales = [];
let errorEstadoVoz = null;
let comprobandoVoz = false;
const trabajosMasivos = new Set();

try {
  if (fs.existsSync(VOZ_ESTADO)) {
    const datos = JSON.parse(fs.readFileSync(VOZ_ESTADO, 'utf8'));
    if (!Array.isArray(datos)) throw new Error('El archivo no contiene una lista válida.');
    canalesTemporales = datos;
  }
} catch (error) {
  errorEstadoVoz = error;
  console.error('No se pudo leer el registro de voz; creación desactivada:', error.message);
}

function guardarCanalesTemporales() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporal = `${VOZ_ESTADO}.tmp`;
  fs.writeFileSync(temporal, JSON.stringify(canalesTemporales, null, 2), 'utf8');
  fs.renameSync(temporal, VOZ_ESTADO);
}

function puedeUsarVoz() {
  if (SIN_VOLUMEN) return 'Configura primero un volumen persistente de Railway en /app/data.';
  if (errorEstadoVoz) return 'No se puede leer el registro de voz. Revisa los registros de Railway.';
  return null;
}

function embedResultado(titulo, color, autor, rol, usuarios, errores = []) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(titulo)
    .addFields(
      { name: 'Por:', value: `<@${autor.id}>`, inline: false },
      { name: 'Rol:', value: rol ? `<@&${rol.id}>` : '—', inline: false },
      { name: 'Usuario(s):', value: String(usuarios).slice(0, 1000), inline: false },
    )
    .setFooter({ text: '/9 BOT • Gestión de roles' })
    .setTimestamp();
  if (errores.length) {
    embed.addFields({
      name: '⚠️ Errores / Fallidos',
      value: errores.join('\n').slice(0, 1000),
    });
  }
  return embed;
}

async function responder(mensaje, embed) {
  try {
    await mensaje.channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    console.error('No se pudo responder en el canal:', error.message);
  }
}

async function denegar(mensaje, motivo) {
  const embed = new EmbedBuilder()
    .setColor(ROJO)
    .setTitle('❌ Acción denegada')
    .addFields(
      { name: 'Por:', value: `<@${mensaje.author.id}>` },
      { name: '⚠️ Errores / Fallidos', value: motivo.slice(0, 1000) },
    )
    .setFooter({ text: '/9 BOT • Seguridad' })
    .setTimestamp();
  await responder(mensaje, embed);
}

async function obtenerMiembro(servidor, id) {
  return servidor.members.fetch({ user: id, force: true });
}

async function prepararStaff(mensaje) {
  const servidor = mensaje.guild;
  const umbral = await servidor.roles.fetch(TICKET_STAFF_ROLE_ID);
  if (!umbral) {
    await denegar(mensaje, 'No existe el rol Ticket Staff configurado. Revisa su ID.');
    return null;
  }
  const actor = await obtenerMiembro(servidor, mensaje.author.id);
  if (actor.roles.highest.comparePositionTo(umbral) < 0) {
    await denegar(mensaje, 'Solo Ticket Staff y los roles situados por encima pueden usar estos comandos.');
    return null;
  }
  const yo = await obtenerMiembro(servidor, bot.user.id);
  return { actor, yo, umbral };
}

function errorRol(servidor, actor, yo, rol) {
  if (!rol || rol.id === servidor.id || rol.managed) {
    return 'Ese rol no existe, es @everyone o está administrado por una integración.';
  }

  if (!yo.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return 'El bot necesita el permiso Administrar roles.';
  }

  // El STAFF solo puede gestionar roles inferiores al suyo.
  if (actor.roles.highest.comparePositionTo(rol) <= 0) {
    return 'No puedes asignar ni quitar roles de tu mismo nivel o superior.';
  }

  // El bot también debe superar al rol solicitado.
  if (yo.roles.highest.comparePositionTo(rol) <= 0) {
    return 'El rol del bot debe estar por encima del rol solicitado.';
  }

  if (
  rol.permissions.has(PermissionFlagsBits.Administrator) ||
  rol.permissions.has(PermissionFlagsBits.ManageRoles)
) {
  return 'No puedes gestionar roles con permisos administrativos.';
}return null;
}

function errorObjetivo(servidor, actor, yo, objetivo) {
  if (!objetivo) return 'No se encontró al usuario en este servidor.';
  if (objetivo.id === actor.id) return 'No puedes cambiar tus propios roles con este comando.';
  if (objetivo.id === servidor.ownerId) return 'No puedes modificar los roles del propietario.';
  if (objetivo.id === bot.user.id || objetivo.user.bot) {
    return 'No se gestionan roles de bots mediante estos comandos.';
  }
  if (actor.roles.highest.comparePositionTo(objetivo.roles.highest) <= 0) {
    return 'No puedes gestionar a un miembro de tu mismo nivel o superior.';
  }
  if (yo.roles.highest.comparePositionTo(objetivo.roles.highest) <= 0) {
    return 'El bot no puede gestionar a ese miembro por la jerarquía de roles.';
  }
  return null;
}

async function gestionarRol(mensaje, accion) {
  const patron = accion === 'addrol'
    ? /^!addrol\s+<@!?(\d{17,22})>\s+<@&(\d{17,22})>\s*$/i
    : /^!removerol\s+<@!?(\d{17,22})>\s+<@&(\d{17,22})>\s*$/i;
  const partes = mensaje.content.trim().match(patron);
  if (!partes) {
    return denegar(mensaje, `Uso: !${accion} @usuario @Rol`);
  }
  const [, usuarioId, rolId] = partes;
  const contexto = await prepararStaff(mensaje);
  if (!contexto) return;
  const { actor, yo } = contexto;
  const rol = await mensaje.guild.roles.fetch(rolId).catch(() => null);
  const prohibicionRol = errorRol(mensaje.guild, actor, yo, rol);
  if (prohibicionRol) return denegar(mensaje, prohibicionRol);
 // Obtener al usuario, sin restringirlo por su jerarquía
const objetivo = await obtenerMiembro(mensaje.guild, usuarioId).catch(() => null);

if (!objetivo) {
  return denegar(mensaje, '❌ No se encontró al usuario.');
}
  const agregar = accion === 'addrol';
  const titulo = agregar ? '✅ Rol Añadido' : '✅ Rol Removido';
  const color = agregar ? VERDE : ROJO;
  const yaEsta = objetivo.roles.cache.has(rol.id);
  const errores = [];
  if (agregar && yaEsta) errores.push('El usuario ya tiene ese rol. No se modificó nada.');
  if (!agregar && !yaEsta) errores.push('El usuario no tiene ese rol. No se modificó nada.');
  if (errores.length === 0) {
    try {
      if (agregar) {
        await objetivo.roles.add(rol, `Solicitado por ${mensaje.author.id} mediante /9 BOT`);
      } else {
        await objetivo.roles.remove(rol, `Solicitado por ${mensaje.author.id} mediante /9 BOT`);
      }
    } catch (error) {
      errores.push(`Discord rechazó la operación: ${error.message}`);
    }
  }
  await responder(mensaje, embedResultado(
    errores.length ? '⚠️ No se completó la operación' : titulo,
    errores.length ? AMARILLO : color,
    mensaje.author, rol, `<@${objetivo.id}>`, errores,
  ));
}

async function agregarRolATodos(mensaje) {
  const partes = mensaje.content.trim().match(/^!addrolall\s+<@&(\d{17,22})>\s*$/i);
  if (!partes) return denegar(mensaje, 'Uso: !addrolall @Rol');
  const contexto = await prepararStaff(mensaje);
  if (!contexto) return;
  let { actor, yo, umbral } = contexto;
  const rol = await mensaje.guild.roles.fetch(partes[1]).catch(() => null);
  const problema = errorRol(mensaje.guild, actor, yo, rol);
  if (problema) return denegar(mensaje, problema);
  if (trabajosMasivos.has(mensaje.guild.id)) {
    return denegar(mensaje, 'Ya se está ejecutando un !addrolall en este servidor. Espera a que termine.');
  }
  trabajosMasivos.add(mensaje.guild.id);
  let informe = null;
  try {
    informe = await mensaje.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(AZUL).setTitle('⏳ Añadiendo rol...')
        .setDescription('Consultando miembros y respetando la jerarquía de Discord.')],
      allowedMentions: { parse: [] },
    });
    const miembros = await mensaje.guild.members.fetch();
    let agregados = 0;
    let yaTenian = 0;
    let omitidos = 0;
    const errores = [];
    let revisados = 0;
    let abortado = false;
    for (const miembro of miembros.values()) {
      // Si el staff pierde su cargo mientras se ejecuta el proceso, se detiene.
      if (revisados % 10 === 0) {
        actor = await obtenerMiembro(mensaje.guild, mensaje.author.id);
        yo = await obtenerMiembro(mensaje.guild, bot.user.id);
        if (actor.roles.highest.comparePositionTo(umbral) < 0 ||
            errorRol(mensaje.guild, actor, yo, rol)) {
          errores.push('Proceso interrumpido: cambiaron los permisos o la jerarquía.');
          abortado = true;
          break;
        }
      }
      revisados += 1;
      // Permitir asignar roles a cualquier miembro, incluido el STAFF.
// No incluir cuentas de bots en la operación masiva.
if (miembro.user.bot) {
  omitidos += 1;
  continue;
}
      if (miembro.roles.cache.has(rol.id)) {
        yaTenian += 1;
        continue;
      }
      try {
        await miembro.roles.add(rol, `!addrolall solicitado por ${mensaje.author.id}`);
        agregados += 1;
      } catch (error) {
        omitidos += 1;
        if (errores.length < 8) errores.push(`<@${miembro.id}>: ${error.message.slice(0, 110)}`);
      }
    }
    const resumen = [
      `**Miembros procesados:** ${revisados} / ${miembros.size}`,
      `**Roles añadidos:** ${agregados}`,
      `**Ya tenían el rol:** ${yaTenian}`,
      `**Omitidos o fallidos:** ${omitidos}`,
      abortado ? '**Proceso detenido antes de terminar.**' : '',
    ].filter(Boolean).join('\n');
    const respuesta = embedResultado(
      abortado || errores.length ? '⚠️ Asignación finalizada con incidencias' : '✅ Rol Añadido a Todos',
      abortado || errores.length ? AMARILLO : VERDE,
      mensaje.author, rol, resumen, errores,
    );
    if (informe) {
      await informe.edit({ embeds: [respuesta], allowedMentions: { parse: [] } });
    } else {
      await responder(mensaje, respuesta);
    }
  } catch (error) {
    await denegar(mensaje, `No se pudo completar !addrolall: ${error.message}`);
  } finally {
    trabajosMasivos.delete(mensaje.guild.id);
  }
}

function duracionLegible(ms) {
  if (ms <= 0) return 'Vencido; pendiente de eliminación';
  const minutos = Math.ceil(ms / 60000);
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const mins = minutos % 60;
  return [dias && `${dias}d`, horas && `${horas}h`, mins && `${mins}m`].filter(Boolean).join(' ');
}

async function comprobarCaducidades() {
  if (comprobandoVoz || errorEstadoVoz || SIN_VOLUMEN) return;
  comprobandoVoz = true;
  try {
    let modificados = false;
    const restantes = [];
    for (const item of canalesTemporales) {
      if (Date.now() < item.venceEn) {
        restantes.push(item);
        continue;
      }
      try {
        const servidor = bot.guilds.cache.get(item.servidorId);
        if (!servidor) {
          // El bot ya no está en ese servidor: no puede gestionar ese canal.
          restantes.push(item);
          continue;
        }
        const canal = await servidor.channels.fetch(item.canalId);
        if (canal) await canal.delete('Finalizó el tiempo configurado en /9 BOT');
        console.log('⏰ Canal temporal eliminado:', item.canalId);
        modificados = true;
      } catch (error) {
        if (error.code === 10003) {
          modificados = true; // Ya lo borraron manualmente.
        } else {
          console.error('No se pudo eliminar el canal temporal:', item.canalId, error.message);
          restantes.push(item); // Reintentar en el siguiente barrido.
        }
      }
    }
    if (modificados) {
      canalesTemporales = restantes;
      guardarCanalesTemporales();
    }
  } catch (error) {
    errorEstadoVoz = error;
    console.error('Problema con el registro de voz:', error.message);
  } finally {
    comprobandoVoz = false;
  }
}

async function crearVozTemporal(mensaje) {
  const partes = mensaje.content.trim().match(
    /^!voz\s+tiempo\s+<@!?(\d{17,22})>\s+(\d+)([mhd])\s+(.+)$/i,
  );
  if (!partes) return denegar(mensaje, 'Uso: !voz tiempo @usuario 1h Sala (también: 30m o 1d).');
  const contexto = await prepararStaff(mensaje);
  if (!contexto) return;
  const almacenamiento = puedeUsarVoz();
  if (almacenamiento) return denegar(mensaje, almacenamiento);
  if (!contexto.yo.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return denegar(mensaje, 'El bot necesita Administrar canales para crear salas temporales.');
  }
  const usuario = await obtenerMiembro(mensaje.guild, partes[1]).catch(() => null);
  if (!usuario) return denegar(mensaje, 'Ese usuario no está en este servidor.');
  const unidad = partes[3].toLowerCase();
  const multiplicador = { m: 60000, h: 3600000, d: 86400000 }[unidad];
  const duracion = Number(partes[2]) * multiplicador;
  if (!Number.isSafeInteger(duracion) || duracion < 60000 || duracion > MAX_DURACION_MS) {
    return denegar(mensaje, 'La duración debe estar entre 1 minuto y 7 días.');
  }
  const nombre = partes[4].trim();
  if (!nombre || nombre.length > 100 || /[\r\n]/.test(nombre)) {
    return denegar(mensaje, 'El nombre del canal debe tener entre 1 y 100 caracteres y una sola línea.');
  }
 // Categoría fija para todos los canales temporales
const categoria = await mensaje.guild.channels.fetch('1550565116204941344').catch(() => null);

if (!categoria || categoria.type !== ChannelType.GuildCategory) {
  return denegar(mensaje, '❌ No se encontró la categoría de voz configurada.');
}
  const permisos = categoria
    ? categoria.permissionOverwrites.cache.map(item => ({
        id: item.id, type: item.type, allow: item.allow.bitfield, deny: item.deny.bitfield,
      }))
    : [];
  const anterior = permisos.find(item => item.id === usuario.id);
  const acceso = PermissionFlagsBits.ViewChannel | PermissionFlagsBits.Connect | PermissionFlagsBits.Speak;
  if (anterior) {
    anterior.allow |= acceso;
    anterior.deny &= ~acceso;
  } else {
    permisos.push({ id: usuario.id, allow: acceso });
  }
  let canal = null;
  try {
    canal = await mensaje.guild.channels.create({
      name: nombre,
      type: ChannelType.GuildVoice,
      parent: categoria?.id ?? null,
      permissionOverwrites: permisos,
      reason: `Canal temporal creado por ${mensaje.author.id} para ${usuario.id}`,
    });
    const nuevo = {
      servidorId: mensaje.guild.id,
      canalId: canal.id,
      nombre: canal.name,
      usuarioId: usuario.id,
      venceEn: Date.now() + duracion,
    };
    canalesTemporales.push(nuevo);
    try {
      guardarCanalesTemporales();
    } catch (error) {
      canalesTemporales = canalesTemporales.filter(item => item.canalId !== canal.id);
      await canal.delete('No se pudo guardar su vencimiento temporal').catch(console.error);
      throw new Error(`No se pudo guardar el vencimiento; la sala se canceló: ${error.message}`);
    }
    const embed = new EmbedBuilder()
      .setColor(AZUL).setTitle('🎙️ Canal Temporal Creado')
      .addFields(
        { name: 'Por:', value: `<@${mensaje.author.id}>` },
        { name: 'Usuario:', value: `<@${usuario.id}>` },
        { name: 'Canal:', value: `<#${canal.id}>` },
        { name: 'Duración:', value: duracionLegible(duracion), inline: true },
        { name: 'Vence:', value: `<t:${Math.floor(nuevo.venceEn / 1000)}:F>`, inline: true },
      )
      .setFooter({ text: '/9 BOT • Canal temporal' }).setTimestamp();
    await responder(mensaje, embed);
  } catch (error) {
    await denegar(mensaje, `No se pudo crear la sala: ${error.message}`);
  }
}

async function listarVozTemporal(mensaje) {
  const contexto = await prepararStaff(mensaje);
  if (!contexto) return;
  const almacenamiento = puedeUsarVoz();
  if (almacenamiento) return denegar(mensaje, almacenamiento);
  await comprobarCaducidades();
  const activos = canalesTemporales
    .filter(item => item.servidorId === mensaje.guild.id)
    .sort((a, b) => a.venceEn - b.venceEn);
  const lista = activos.slice(0, 25).map(item =>
    `• <#${item.canalId}> — ${duracionLegible(item.venceEn - Date.now())} (vence <t:${Math.floor(item.venceEn / 1000)}:R>)`
  );
  const embed = new EmbedBuilder()
    .setColor(AZUL).setTitle('⏰ Canales Temporales Activos')
    .setDescription(lista.join('\n') || 'No hay canales temporales registrados en este servidor.')
    .setFooter({ text: `Mostrando ${lista.length} de ${activos.length} • /9 BOT` })
    .setTimestamp();
  await responder(mensaje, embed);
}

// Handler independiente del anuncio: sigue funcionando aunque la variable
// ANUNCIO_YA_PUBLICADO=true haga return dentro del evento ClientReady anterior.
bot.on(Events.MessageCreate, async mensaje => {
  if (!mensaje.guild || mensaje.author.bot || !mensaje.content.startsWith(PREFIX)) return;
  const comando = mensaje.content.trim().split(/\s+/)[0].toLowerCase();
  if (!['!addrol', '!addrolall', '!removerol', '!voz', '!voztiempo'].includes(comando)) return;
  try {
    if (comando === '!addrol') return await gestionarRol(mensaje, 'addrol');
    if (comando === '!removerol') return await gestionarRol(mensaje, 'removerol');
    if (comando === '!addrolall') return await agregarRolATodos(mensaje);
    if (comando === '!voz') return await crearVozTemporal(mensaje);
    if (comando === '!voztiempo') return await listarVozTemporal(mensaje);
  } catch (error) {
    console.error('Error al procesar el comando:', error);
    await denegar(mensaje, 'Ocurrió un error al ejecutar el comando. Revisa los registros del bot.');
  }
});

bot.once(Events.ClientReady, () => {
  if (SIN_VOLUMEN) {
    console.warn('⚠️ Sin volumen en Railway: comandos de voz temporal desactivados hasta crear uno.');
  } else {
    void comprobarCaducidades();
    setInterval(() => void comprobarCaducidades(), 30000);
  }
});
require('./tickets')(bot);
bot.login(TOKEN).catch(error => {
  console.error('No fue posible iniciar sesión. Revisa TOKEN:', error.message);
});
