'use strict';

// Módulo de tickets para /9 GNG.
// No modifica los comandos de index.js ni la publicidad existente.

const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

const fs = require('node:fs');
const path = require('node:path');

const RED = 0xed4245;
const GREEN = 0x57f287;
const YELLOW = 0xfee75c;

const LOGO = path.join(__dirname, 'logo.png');
const IPHONE_BANNER = path.join(__dirname, 'iphone.png');
const BASIC_MODI_BANNER = path.join(__dirname, 'basic_modi.png');

// Cada creador utiliza su propia imagen.
const SENSI_BANNERS = Object.freeze({
  deusa: 'deusa.png',
  haru: 'haru.png',
  phzin: 'phzin.png',
  fantasma: 'fantasma.png',
  anasw: 'anasw.png',
  pelezin: 'pelezin.png',
});

const SENSI_CREATORS = Object.freeze({
  deusa: 'DEUSA',
  haru: 'HARU',
  phzin: 'PHZIN',
  fantasma: 'FANTASMA',
  anasw: 'ANASW',
  pelezin: 'PELEZIN',
});

const SENSI_PLATFORMS = Object.freeze({
  android: {
    label: 'Android',
    emoji: '📱',
    roles: ['mob', 'director', 'mod', 'admin', 'fundador'],
  },

  ios: {
    label: 'iPhone',
    emoji: '🍎',
    roles: ['mob', 'director', 'mod', 'admin', 'fundador'],
  },

  emu: {
    label: 'Emulador',
    emoji: '💻',
    roles: ['emulador', 'director', 'mod', 'admin', 'fundador'],
  },
});

const CREATOR_COMMANDS = Object.fromEntries(
  Object.keys(SENSI_CREATORS).map(slug => [
    `${slug}panel`,
    slug,
  ])
);

// ============================================================
// ROLES
// ============================================================

const ROLE_ENV = {
  emulador: 'ROL_EMULADOR_ID',
  director: 'ROL_DIRECTOR_ID',
  mod: 'ROL_MOD_ID',
  admin: 'ROL_ADMIN_ID',
  mob: 'ROL_MOB_ID',
  staff: 'ROL_STAFF_ID',
  ticket: 'ROL_TICKET_ID',
  fundador: 'ROL_FUNDADOR_ID',
};

const CATEGORIES = {
  soporte: {
    label: 'Soporte Staff',
    emoji: '🛡️',
    button: ButtonStyle.Danger,
    roles: [
      'emulador',
      'director',
      'mod',
      'admin',
      'mob',
      'staff',
      'ticket',
      'fundador',
    ],
  },

  emulador: {
    label: 'Emulador',
    emoji: '💻',
    button: ButtonStyle.Secondary,
    roles: [
      'emulador',
      'director',
      'mod',
      'admin',
      'fundador',
    ],
  },

  android: {
    label: 'Android',
    emoji: '📱',
    button: ButtonStyle.Success,
    roles: [
      'mob',
      'director',
      'mod',
      'admin',
      'fundador',
    ],
  },

  ios: {
    label: 'iOS',
    emoji: '🍎',
    button: ButtonStyle.Primary,
    roles: [
      'mob',
      'director',
      'mod',
      'admin',
      'fundador',
    ],
  },

  // En BASIC MODI se añade al hilo a los miembros
  // con /9 MOB o cualquier rol superior.
  basicmodi: {
    label: 'BASIC MODI',
    emoji: '🎯',
    button: ButtonStyle.Success,
    roles: [
      'mob',
      'director',
      'mod',
      'admin',
      'fundador',
    ],
  },
};

// Categorías independientes para cada creador y plataforma.
// Se mantienen los identificadores antiguos de HARU.
for (const [slug, nombre] of Object.entries(SENSI_CREATORS)) {
  for (const [plataforma, datos] of Object.entries(SENSI_PLATFORMS)) {
    CATEGORIES[`${slug}${plataforma}`] = {
      label: `/9 SENSI | ${nombre} — ${datos.label}`,
      emoji: datos.emoji,
      button: ButtonStyle.Success,
      roles: datos.roles,
    };
  }
}

// ============================================================
// MÉTODOS DE PAGO
// El bot no confirma pagos automáticamente.
// ============================================================

const PAYMENT_METHODS = {
  binance: {
    label: 'Binance',
    emoji: '🟡',
    instructions:
      'Solicita al staff los datos de Binance antes de pagar; no se ha configurado una dirección ni un identificador de cobro.',
  },

  nequi: {
    label: 'Nequi',
    emoji: '📱',
    instructions: 'Número de Nequi: **3126719629**',
  },

  paypal: {
    label: 'PayPal',
    emoji: '💳',
    instructions:
      'Enlace de pago: https://www.paypal.me/SamuelOrleda',
  },

  remitly: {
    label: 'Remitly',
    emoji: '🌍',
    instructions:
      'Destino de la transferencia: **Nequi 3126719629**. Utiliza Remitly para enviar a ese destino.',
  },

  nu: {
    label: 'Nu Bank / Transferencia / Depósito',
    emoji: '🏦',
    instructions: 'Llave de Nu: `@DLT423`',
  },
};

const COOLDOWN_MS = 5 * 60 * 1000;

const creating = new Set();
const claiming = new Set();
const closing = new Set();
const staffCalls = new Map();

// ============================================================
// CONFIGURACIÓN
// ============================================================

function config() {
  const missing = [];

  const channelId = (
    process.env.TICKET_CANAL_ID || ''
  ).trim();

  if (!/^\d{17,22}$/.test(channelId)) {
    missing.push('TICKET_CANAL_ID');
  }

  const roleIds = {};

  for (const [name, envName] of Object.entries(ROLE_ENV)) {
    const id = (process.env[envName] || '').trim();

    if (!/^\d{17,22}$/.test(id)) {
      missing.push(envName);
    } else {
      roleIds[name] = id;
    }
  }

  return {
    channelId,
    roleIds,
    missing,
  };
}

function idsFor(category, cfg) {
  return CATEGORIES[category].roles
    .map(name => cfg.roleIds[name])
    .filter(Boolean);
}

// BASIC MODI: /9 MOB o superior.
// Las demás categorías conservan sus permisos anteriores.
function isTeam(member, category, cfg) {
  if (category === 'basicmodi') {
    const rolMob = member.guild.roles.cache.get(
      cfg.roleIds.mob
    );

    return Boolean(
      rolMob &&
      member.roles.highest.comparePositionTo(rolMob) >= 0
    );
  }

  return idsFor(category, cfg).some(
    id => member.roles.cache.has(id)
  );
}

// ============================================================
// IDENTIFICACIÓN SEGURA DEL PROPIETARIO
// No se depende del nombre visible del ticket.
// ============================================================

function panelPertenece(message, category, ownerId) {
  const embed = message?.embeds?.[0];

  if (!embed?.title?.includes('TICKET ABIERTO')) {
    return false;
  }

  const categoria = embed.fields?.find(
    field => field.name === '🔮 Categoría'
  );

  const creador = embed.fields?.find(
    field => field.name === '👑 Creado por'
  );

  return (
    categoria?.value === CATEGORIES[category]?.label &&
    creador?.value === `<@${ownerId}>`
  );
}

async function hiloPertenece(thread, category, ownerId, botId) {
  // Compatibilidad con los tickets antiguos que llevan ID.
  if (thread.name === `ticket-${category}-${ownerId}`) {
    return true;
  }

  if (!thread.name.startsWith(`ticket-${category}-`)) {
    return false;
  }

  const mensajes = await thread.messages.fetch({
    limit: 100,
  });

  return mensajes.some(
    msg =>
      msg.author.id === botId &&
      panelPertenece(msg, category, ownerId)
  );
}

// ============================================================
// PANEL PRINCIPAL
// ============================================================

function mainPanel(bot) {
  const embed = new EmbedBuilder()
    .setColor(RED)
    .setTitle('🎫 Centro de Atención • /9 GNG')
    .setDescription([
      '## Bienvenido al panel de tickets de /9 GNG',
      'Si necesitas ayuda, nuestro equipo te atenderá lo antes posible.',
      '',
      '**Selecciona la categoría correspondiente para abrir un ticket privado:**',
      '🛡️ **Soporte Staff** — ayuda general.',
      '💻 **Emulador** — asistencia para emuladores.',
      '📱 **Android** — asistencia para Android.',
      '🍎 **iOS** — asistencia para iPhone/iOS.',
      '',
      '📌 Explica tu situación dentro del ticket para recibir una mejor atención.',
    ].join('\n'))
    .setFooter({
      text: '/9 GNG • Centro de Atención',
    })
    .setTimestamp();

  if (fs.existsSync(LOGO)) {
    embed.setThumbnail('attachment://logo.png');
  } else if (bot.user) {
    embed.setThumbnail(bot.user.displayAvatarURL());
  }

  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(CATEGORIES)
      .filter(([slug]) =>
        ['soporte', 'emulador', 'android', 'ios'].includes(slug)
      )
      .map(([slug, info]) =>
        new ButtonBuilder()
          .setCustomId(`gng:open:${slug}`)
          .setLabel(info.label)
          .setEmoji(info.emoji)
          .setStyle(info.button)
      )
  );

  return {
    embeds: [embed],
    components: [row],

    ...(fs.existsSync(LOGO)
      ? {
          files: [
            new AttachmentBuilder(LOGO, {
              name: 'logo.png',
            }),
          ],
        }
      : {}),

    allowedMentions: {
      parse: [],
    },
  };
}

// ============================================================
// PANEL SENSI IOS
// ============================================================

function sensiIosPanel() {
  if (!fs.existsSync(IPHONE_BANNER)) {
    throw new Error(
      'Falta iphone.png junto a tickets.js. Sube la imagen original a GitHub.'
    );
  }

  const banner = new EmbedBuilder()
    .setColor(0xff7a00)
    .setImage('attachment://iphone.png');

  const product = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle('📱 SENSI /9 IOS')
    .setDescription([
      '🟠 Sensibilidad para todos los iPhone',
      '🟠 Estabilización de mira',
      '🟠 HUDs exclusivos y configuraciones',
      '🟠 Optimización para celular',
      '🟠 Métodos para dar todo a la cabeza (full capa)',
      '🟠 Mira 2x y 4x con arrastre directo a la cabeza',
      '🟠 Nuevas actualizaciones de sensibilidad',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '**📦 ENTREGA**',
      'Atención y entrega mediante ticket privado.',
    ].join('\n'))
    .setFooter({
      text: '/9 GNG • Producto para iOS',
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gng:open:ios')
      .setLabel('Abrir Ticket MOB')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Success)
  );

  return {
    embeds: [banner, product],

    files: [
      new AttachmentBuilder(IPHONE_BANNER, {
        name: 'iphone.png',
      }),
    ],

    components: [row],

    allowedMentions: {
      parse: [],
    },
  };
}

// ============================================================
// PANEL SENSI EMULADOR
// ============================================================

function sensiEmuladorPanel() {
  const embed = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle('SENSIBILIDAD PARA CUALQUIER EMULADOR')
    .setDescription([
      '**Acerca de este producto**',
      '',
      '• Configuración del emulador.',
      '• Quitar delay.',
      '• Mira estable.',
      '• Métodos secretos de jugadores conocidos.',
      '• Regedits privados de jugadores conocidos.',
      '• Sensibilidad para cualquier modo de juego: baja / media / alta.',
      '',
      'Toda instalación se hace vía AnyDesk.',
    ].join('\n'));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gng:open:emulador')
      .setLabel('Abrir Ticket EMU')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Success)
  );

  return {
    embeds: [embed],
    components: [row],

    allowedMentions: {
      parse: [],
    },
  };
}

// ============================================================
// PANEL BASIC MODI MEJORADO
// ============================================================

function basicModiPanel() {
  if (!fs.existsSync(BASIC_MODI_BANNER)) {
    throw new Error(
      'Falta basic_modi.png junto a tickets.js. Súbela también a GitHub.'
    );
  }

  const banner = new EmbedBuilder()
    .setColor(0xff7a00)
    .setImage('attachment://basic_modi.png');

  const product = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle('🎯 BASIC MODI | /9 GNG')
    .setDescription([
      '**MODIFICACIÓN INTERNA · ¿QUÉ INCLUYE?**',
      '━━━━━━━━━━━━━━━━━━',
      '🎯 Estabilización de mira.',
      '🎯 Métodos y ajustes para mejorar los tiros a la cabeza (full capa).',
      '🎮 HUDs exclusivos y configuraciones.',
      '',
      '**📦 ATENCIÓN**',
      'Abre un ticket privado para consultar compatibilidad, condiciones y entrega.',
      'El equipo de /9 MOB y los rangos superiores podrán atenderte.',
    ].join('\n'))
    .setFooter({
      text: '/9 GNG • BASIC MODI | Soporte privado',
    });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gng:open:basicmodi')
      .setLabel('Abrir Ticket MODI')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Success)
  );

  return {
    embeds: [banner, product],

    files: [
      new AttachmentBuilder(BASIC_MODI_BANNER, {
        name: 'basic_modi.png',
      }),
    ],

    components: [row],

    allowedMentions: {
      parse: [],
    },
  };
}

// ============================================================
// PANELES /9 SENSI POR CREADOR
// ============================================================

function sensiCreatorPanel(slug) {
  const nombre = SENSI_CREATORS[slug];

  if (!nombre) {
    throw new Error('No existe ese creador de /9 SENSI.');
  }

  const archivoImagen = SENSI_BANNERS[slug];
  const rutaImagen = path.join(__dirname, archivoImagen);

  if (!fs.existsSync(rutaImagen)) {
    throw new Error(
      `Falta ${archivoImagen} junto a tickets.js. Sube esa imagen a GitHub.`
    );
  }

  const imagen = new EmbedBuilder()
    .setColor(0xff7a00)
    .setImage(`attachment://${archivoImagen}`);

  const producto = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle(`/9 SENSI | X | ${nombre}`)
    .setDescription([
      '**Sensibilidades y configuraciones para jugar.**',
      'Consulta la compatibilidad y las condiciones con el equipo antes de comprar.',
      '',
      '**LO QUE OBTIENES**',
      '━━━━━━━━━━━━━━━━━━',
      '🟠 Guía paso a paso para conseguir más tiros a la cabeza (full capa).',
      '🟠 Configuraciones personalizadas.',
      '🟠 HUDs exclusivos.',
      '🟠 Optimizaciones avanzadas.',
      '🟠 Consejos y ajustes de juego.',
      '🟠 Configuraciones para mira roja.',
      '🟠 Métodos y ajustes exclusivos.',
      '🟠 Información sobre actualizaciones disponibles.',
      '🟠 Opciones para Android, iPhone y emulador.',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '**📦 ENTREGA**',
      '• Información y entrega coordinadas mediante ticket privado.',
      '• Soporte por Discord.',
      '',
      '**👇 Selecciona tu plataforma para abrir un ticket.**',
    ].join('\n'))
    .setFooter({
      text: `/9 GNG • /9 SENSI | ${nombre}`,
    });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`gng:sensi:${slug}`)
    .setPlaceholder('Selecciona un producto')
    .addOptions(
      Object.entries(SENSI_PLATFORMS).map(
        ([plataforma, datos]) => ({
          label: `/9 SENSI ${nombre} — ${datos.label}`,
          value: `${slug}${plataforma}`,
          emoji: datos.emoji,
          description: `Abrir ticket privado para ${datos.label}`,
        })
      )
    );

  return {
    embeds: [imagen, producto],

    files: [
      new AttachmentBuilder(rutaImagen, {
        name: archivoImagen,
      }),
    ],

    components: [
      new ActionRowBuilder().addComponents(menu),
    ],

    allowedMentions: {
      parse: [],
    },
  };
}

// ============================================================
// BOTONES DENTRO DE LOS TICKETS
// ============================================================

function buttons(category, ownerId, status = 'waiting') {
  const custom = action =>
    `gng:${action}:${category}:${ownerId}`;

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(custom('call'))
      .setEmoji('📣')
      .setLabel('Llamar Staff')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(status === 'closed'),

    new ButtonBuilder()
      .setCustomId(custom('claim'))
      .setEmoji('🤝')
      .setLabel('Atender Ticket')
      .setStyle(ButtonStyle.Success)
      .setDisabled(status !== 'waiting')
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(custom('close'))
      .setEmoji('❌')
      .setLabel('Cerrar Ticket')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(status === 'closed'),

    new ButtonBuilder()
      .setCustomId(custom('pay'))
      .setEmoji('💳')
      .setLabel('Métodos de Pago')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row1, row2];
}

// ============================================================
// MENSAJES AL ABRIR UN TICKET
// ============================================================

function ticketEmbeds(category, ownerId, staffIds) {
  const created = Math.floor(Date.now() / 1000);

  const main = new EmbedBuilder()
    .setColor(RED)
    .setTitle('✅ TICKET ABIERTO')
    .setDescription([
      `👋 **Hola <@${ownerId}>, bienvenido a tu ticket.**`,
      '',
      'Siéntete libre de describir lo que necesitas, nuestro equipo te atenderá pronto.',
    ].join('\n'))
    .addFields(
      {
        name: '🔮 Categoría',
        value: CATEGORIES[category].label,
        inline: true,
      },
      {
        name: '👑 Creado por',
        value: `<@${ownerId}>`,
        inline: true,
      },
      {
        name: 'ⓘ Estado',
        value: '🟡 Esperando staff',
        inline: true,
      },
      {
        name: '⏰ Creado',
        value: `<t:${created}:R>`,
        inline: false,
      },
      {
        name: '📣 Atención urgente',
        value: 'Pulsa **Llamar Staff** si necesitas atención urgente.',
      }
    )
    .setFooter({
      text: '/9 GNG • Ticket',
    })
    .setTimestamp();

  const info = new EmbedBuilder()
    .setColor(RED)
    .setTitle('📌 Información Importante')
    .setDescription(
      '━━━━━━━━━━━━━━━━━━\n' +
      '> Por favor, espera a que un staff te atienda.\n' +
      '> Mientras tanto, describe tu problema detalladamente.\n' +
      '━━━━━━━━━━━━━━━━━━'
    )
    .setTimestamp();

  return {
    main,
    info,
    staffIds,
  };
}

function ticketStatus(message) {
  const field = message.embeds[0]?.fields?.find(
    item => item.name === 'ⓘ Estado'
  );

  if (!field) return null;

  if (field.value.includes('Cerrado')) {
    return 'closed';
  }

  if (field.value.includes('En atención')) {
    return 'claimed';
  }

  return 'waiting';
}

async function updateTicketMessage(
  message,
  category,
  ownerId,
  value,
  status
) {
  const original = message.embeds[0];

  if (!original) {
    throw new Error(
      'No se encontró el panel original del ticket.'
    );
  }

  const embed = EmbedBuilder.from(original);

  const fields = original.fields.map(field =>
    field.name === 'ⓘ Estado'
      ? {
          name: field.name,
          value,
          inline: field.inline,
        }
      : field
  );

  embed.setFields(fields);

  await message.edit({
    embeds: [
      embed,
      ...message.embeds.slice(1),
    ],

    components: buttons(
      category,
      ownerId,
      status
    ),

    allowedMentions: {
      parse: [],
    },
  });
}

// ============================================================
// OBTENER STAFF AUTORIZADO
// ============================================================

async function getStaff(guild, category, cfg) {
  // Requiere SERVER MEMBERS INTENT para obtener los miembros.

  if (category === 'basicmodi') {
    const rolMob = await guild.roles
      .fetch(cfg.roleIds.mob)
      .catch(() => null);

    if (!rolMob) {
      throw new Error(
        'No se encontró /9 MOB. Revisa ROL_MOB_ID en Railway.'
      );
    }

    const miembros = await guild.members.fetch();

    return miembros.filter(
      member =>
        !member.user.bot &&
        member.roles.highest.comparePositionTo(rolMob) >= 0
    );
  }

  const ids = idsFor(category, cfg);

  for (const id of ids) {
    const role = await guild.roles
      .fetch(id)
      .catch(() => null);

    if (!role) {
      throw new Error(
        `No se encontró el rol ${id}. Comprueba los IDs en Railway.`
      );
    }
  }

  const all = await guild.members.fetch();

  return all.filter(
    member =>
      !member.user.bot &&
      ids.some(id => member.roles.cache.has(id))
  );
}

async function addStaff(thread, members, ownerId) {
  let added = 0;
  const failed = [];

  for (const member of members.values()) {
    if (member.id === ownerId) continue;

    try {
      await thread.members.add(member.id);
      added++;

    } catch (error) {
      failed.push(
        `${member.id}: ${error.message}`
      );
    }
  }

  if (failed.length) {
    console.warn(
      `[Tickets] No se añadieron ${failed.length} miembros al hilo ${thread.id}:`,
      failed.slice(0, 8)
    );
  }

  return {
    added,
    failed: failed.length,
  };
}

// ============================================================
// RESPUESTAS PRIVADAS
// ============================================================

async function safeRespond(interaction, message) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply({
      content: message,
    });
  }

  return interaction.reply({
    content: message,
    flags: MessageFlags.Ephemeral,
  });
}

// ============================================================
// CREAR TICKET CON NOMBRE DE USUARIO
// ============================================================

async function openTicket(interaction, category, bot) {
  const cfg = config();

  if (cfg.missing.length) {
    return safeRespond(
      interaction,
      `⚠️ Faltan variables en Railway: ${cfg.missing.join(', ')}.`
    );
  }

  const parent = await interaction.guild.channels
    .fetch(cfg.channelId)
    .catch(() => null);

  if (!parent || parent.type !== ChannelType.GuildText) {
    return safeRespond(
      interaction,
      '⚠️ TICKET_CANAL_ID debe ser el ID de un **canal de texto**, no de una categoría.'
    );
  }

  const botMember =
    await interaction.guild.members.fetchMe();

  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.CreatePrivateThreads,
    PermissionFlagsBits.SendMessagesInThreads,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageThreads,
  ];

  const botPerms = parent.permissionsFor(botMember);

  if (
    !needed.every(
      permission => botPerms?.has(permission)
    )
  ) {
    return safeRespond(
      interaction,
      '❌ El bot necesita Ver canal, Crear hilos privados, Enviar mensajes en hilos, Insertar enlaces y Gestionar hilos en el canal de tickets.'
    );
  }

  const owner =
    await interaction.guild.members.fetch(
      interaction.user.id
    );

  if (
    !parent
      .permissionsFor(owner)
      ?.has(PermissionFlagsBits.ViewChannel)
  ) {
    return safeRespond(
      interaction,
      '❌ Necesitas permiso Ver canal en el canal padre de los tickets para entrar al hilo.'
    );
  }

  // Nombre visible: usuario en vez del ID de Discord.
  const username = owner.user.username
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '') || 'usuario';

  const name =
    `ticket-${category}-${username}`.slice(0, 100);

  // La identificación interna sigue usando el ID real.
  const key =
    `${interaction.guild.id}:${category}:${owner.id}`;

  if (creating.has(key)) {
    return safeRespond(
      interaction,
      '⏳ Ya estamos creando ese ticket, espera unos segundos.'
    );
  }

  creating.add(key);

  try {
    const active = await parent.threads.fetchActive();

    let previous = null;

    // Busca el propietario real para evitar confundir a dos
    // usuarios con el mismo nombre.
    for (const hilo of active.threads.values()) {
      if (
        !hilo.name.startsWith(`ticket-${category}-`)
      ) {
        continue;
      }

      if (
        await hiloPertenece(
          hilo,
          category,
          owner.id,
          bot.user.id
        )
      ) {
        previous = hilo;
        break;
      }
    }

    if (previous) {
      return safeRespond(
        interaction,
        `Ya tienes un ticket de esta categoría abierto: <#${previous.id}>`
      );
    }

    const members = await getStaff(
      interaction.guild,
      category,
      cfg
    );

    const thread = await parent.threads.create({
      name,
      type: ChannelType.PrivateThread,
      invitable: false,
      autoArchiveDuration: 1440,
      reason: `Ticket ${category} creado por ${owner.id}`,
    });

    try {
      // Añadir siempre al usuario que creó el ticket.
      await thread.members.add(owner.id);

      // Añadir al staff autorizado.
      const result = await addStaff(
        thread,
        members,
        owner.id
      );

      const roleIds = idsFor(category, cfg);

      const {
        main,
        info,
      } = ticketEmbeds(
        category,
        owner.id,
        roleIds
      );

      await thread.send({
        content: [
          `<@${owner.id}>`,
          ...roleIds.map(id => `<@&${id}>`),
        ].join(' '),

        embeds: [main],

        components: buttons(
          category,
          owner.id
        ),

        allowedMentions: {
          parse: [],
          users: [owner.id],
          roles: [],
        },
      });

      await thread.send({
        embeds: [info],
        allowedMentions: {
          parse: [],
        },
      });

      let note =
        `✅ Tu ticket privado está listo: <#${thread.id}>`;

      if (result.failed) {
        note +=
          `\n⚠️ ${result.failed} miembro(s) del staff no pudieron añadirse; revisa los logs y permisos.`;
      }

      await safeRespond(interaction, note);

    } catch (error) {
      await thread
        .delete('Falló la configuración del ticket privado')
        .catch(console.error);

      throw error;
    }

  } finally {
    creating.delete(key);
  }
}

// ============================================================
// ACCIONES DE LOS BOTONES
// ============================================================

async function onTicketAction(
  interaction,
  action,
  category,
  ownerId
) {
  const cfg = config();
  const thread = interaction.channel;

  if (cfg.missing.length) {
    return safeRespond(
      interaction,
      `⚠️ Faltan variables: ${cfg.missing.join(', ')}.`
    );
  }

  if (
    !thread ||
    thread.type !== ChannelType.PrivateThread ||
    thread.parentId !== cfg.channelId
  ) {
    return safeRespond(
      interaction,
      'Este botón solo funciona dentro de un ticket privado configurado.'
    );
  }

  // Validación mediante el panel, no mediante el nombre.
  if (
    !panelPertenece(
      interaction.message,
      category,
      ownerId
    )
  ) {
    return safeRespond(
      interaction,
      'La categoría o el autor no coinciden con este ticket.'
    );
  }

  const member =
    await interaction.guild.members.fetch(
      interaction.user.id
    );

  const team = isTeam(
    member,
    category,
    cfg
  );

  const owner = member.id === ownerId;

  if (!team && !owner) {
    return safeRespond(
      interaction,
      'No tienes permiso para gestionar este ticket.'
    );
  }

  // Compatibilidad con botones antiguos.
  if (action === 'admin') {
    await interaction.message.edit({
      components: buttons(
        category,
        ownerId,
        ticketStatus(interaction.message) || 'waiting'
      ),

      allowedMentions: {
        parse: [],
      },
    });

    action = 'pay';
  }

  // MÉTODOS DE PAGO
  if (action === 'pay') {
    const select = new StringSelectMenuBuilder()
      .setCustomId(
        `gng:payment:${category}:${ownerId}:${thread.id}`
      )
      .setPlaceholder(
        'Selecciona tu método de pago'
      )
      .addOptions(
        Object.entries(PAYMENT_METHODS).map(
          ([value, method]) => ({
            label: method.label,
            value,
            emoji: method.emoji,
          })
        )
      );

    return interaction.editReply({
      content:
        '💳 **Métodos de pago /9 GNG**\n' +
        'Elige cómo deseas pagar. El bot enviará las instrucciones dentro de este ticket.',

      components: [
        new ActionRowBuilder().addComponents(select),
      ],

      allowedMentions: {
        parse: [],
      },
    });
  }

  if (
    !interaction.message.embeds[0]?.title?.includes(
      'TICKET ABIERTO'
    )
  ) {
    return safeRespond(
      interaction,
      'No se encontró el panel principal del ticket.'
    );
  }

  const status = ticketStatus(
    interaction.message
  );

  if (status === 'closed') {
    return safeRespond(
      interaction,
      'Este ticket ya está cerrado.'
    );
  }

  // LLAMAR STAFF
  if (action === 'call') {
    if (!owner) {
      return safeRespond(
        interaction,
        'Solo quien abrió el ticket puede utilizar Llamar Staff.'
      );
    }

    const last =
      staffCalls.get(thread.id) || 0;

    if (Date.now() - last < COOLDOWN_MS) {
      const seconds = Math.ceil(
        (
          COOLDOWN_MS -
          (Date.now() - last)
        ) / 1000
      );

      return safeRespond(
        interaction,
        `⏳ Espera ${seconds} segundos antes de volver a llamar al staff.`
      );
    }

    const roleIds = idsFor(
      category,
      cfg
    );

    await thread.send({
      content:
        `📣 **Se solicita atención en ${CATEGORIES[category].label}.** ` +
        roleIds
          .map(id => `<@&${id}>`)
          .join(' '),

      allowedMentions: {
        parse: [],
        roles: roleIds,
      },
    });

    staffCalls.set(
      thread.id,
      Date.now()
    );

    return safeRespond(
      interaction,
      '📣 Aviso enviado. El staff responderá cuando esté disponible.'
    );
  }

  // ATENDER TICKET
  if (action === 'claim') {
    if (!team) {
      return safeRespond(
        interaction,
        'Solo los roles autorizados pueden atender este ticket.'
      );
    }

    if (claiming.has(thread.id)) {
      return safeRespond(
        interaction,
        '⏳ Otro miembro ya está procesando este ticket.'
      );
    }

    claiming.add(thread.id);

    try {
      const fresh =
        await thread.messages.fetch(
          interaction.message.id
        );

      if (ticketStatus(fresh) !== 'waiting') {
        return safeRespond(
          interaction,
          'Este ticket ya fue atendido o cerrado.'
        );
      }

      await updateTicketMessage(
        fresh,
        category,
        ownerId,
        `🟢 En atención por <@${member.id}>`,
        'claimed'
      );

      return safeRespond(
        interaction,
        `🤝 Has tomado el ticket de <@${ownerId}>.`
      );

    } finally {
      claiming.delete(thread.id);
    }
  }

  // CERRAR TICKET
  if (action === 'close') {
    if (!owner && !team) {
      return safeRespond(
        interaction,
        'No tienes permiso para cerrar este ticket.'
      );
    }

    if (closing.has(thread.id)) {
      return safeRespond(
        interaction,
        '⏳ Este ticket ya se está cerrando.'
      );
    }

    closing.add(thread.id);

    try {
      await safeRespond(
        interaction,
        '🗑️ Cerrando y eliminando el ticket…'
      );

      await thread.delete(
        `Ticket cerrado y eliminado por ${member.id}`
      );

      staffCalls.delete(thread.id);

      console.log(
        `[Tickets] Hilo ${thread.id} eliminado por ${member.id}`
      );

      return;

    } catch (error) {
      console.error(
        `[Tickets] No se pudo eliminar el hilo ${thread.id}:`,
        error
      );

      await safeRespond(
        interaction,
        '❌ No se pudo eliminar el ticket. Revisa que el bot tenga «Gestionar hilos» y consulta los registros de Railway.'
      ).catch(console.error);

      return;

    } finally {
      closing.delete(thread.id);
    }
  }
}

// ============================================================
// REGISTRAR MÓDULO DE TICKETS
// ============================================================

module.exports = function setupTickets(bot) {
  bot.once(Events.ClientReady, async () => {
    const commandsToRegister = [
      new SlashCommandBuilder()
        .setName('ticketpanel')
        .setDescription(
          'Publica el panel de tickets de /9 GNG'
        )
        .setDefaultMemberPermissions(
          PermissionFlagsBits.ManageGuild
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName('sensipanel')
        .setDescription(
          'Publica SENSI /9 IOS con la imagen original y ticket MOB'
        )
        .setDefaultMemberPermissions(
          PermissionFlagsBits.ManageGuild
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName('emupanel')
        .setDescription(
          'Publica la sensibilidad para emulador con botón de ticket EMU'
        )
        .setDefaultMemberPermissions(
          PermissionFlagsBits.ManageGuild
        )
        .toJSON(),

      new SlashCommandBuilder()
        .setName('basicmodipanel')
        .setDescription(
          'Publica BASIC MODI con imagen y botón de ticket privado'
        )
        .setDefaultMemberPermissions(
          PermissionFlagsBits.ManageGuild
        )
        .toJSON(),

      ...Object.entries(SENSI_CREATORS).map(
        ([slug, nombre]) =>
          new SlashCommandBuilder()
            .setName(`${slug}panel`)
            .setDescription(
              `Publica /9 SENSI ${nombre} con imagen y selector`
            )
            .setDefaultMemberPermissions(
              PermissionFlagsBits.ManageGuild
            )
            .toJSON()
      ),
    ];

    for (const guild of bot.guilds.cache.values()) {
      try {
        const registered =
          await guild.commands.fetch();

        for (const command of commandsToRegister) {
          const existing = registered.find(
            item => item.name === command.name
          );

          if (!existing) {
            await guild.commands.create(command);

            console.log(
              `[Tickets] /${command.name} registrado en ${guild.name}.`
            );

          } else if (
            CREATOR_COMMANDS[command.name] &&
            existing.description !== command.description
          ) {
            await guild.commands.edit(
              existing.id,
              command
            );

            console.log(
              `[Tickets] /${command.name} actualizado en ${guild.name}.`
            );

          } else {
            console.log(
              `[Tickets] /${command.name} ya registrado en ${guild.name}.`
            );
          }
        }

      } catch (error) {
        console.error(
          `[Tickets] Error registrando paneles en ${guild.id}: ${error.message}`
        );
      }
    }

    const cfg = config();

    if (cfg.missing.length) {
      console.warn(
        '[Tickets] Configuración pendiente en Railway:',
        cfg.missing.join(', ')
      );
    } else {
      console.log(
        '[Tickets] Módulo iniciado. Los paneles se publican únicamente al ejecutar sus comandos.'
      );
    }
  });

  bot.on(Events.InteractionCreate, async interaction => {
    if (!interaction.inGuild()) return;

    // COMANDOS /
    if (interaction.isChatInputCommand()) {
      if (
        ![
          'ticketpanel',
          'sensipanel',
          'emupanel',
          'basicmodipanel',
        ].includes(interaction.commandName) &&
        !CREATOR_COMMANDS[interaction.commandName]
      ) {
        return;
      }

      try {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );

        if (
          !member.permissions.has(
            PermissionFlagsBits.ManageGuild
          )
        ) {
          return safeRespond(
            interaction,
            'Necesitas el permiso Gestionar servidor para publicar el panel.'
          );
        }

        const cfg = config();

        if (cfg.missing.length) {
          return safeRespond(
            interaction,
            `⚠️ Configura primero: ${cfg.missing.join(', ')}.`
          );
        }

        // Publicación solamente manual.
        const payload =
          interaction.commandName === 'sensipanel'
            ? sensiIosPanel()

            : interaction.commandName === 'emupanel'
              ? sensiEmuladorPanel()

              : interaction.commandName === 'basicmodipanel'
                ? basicModiPanel()

                : CREATOR_COMMANDS[interaction.commandName]
                  ? sensiCreatorPanel(
                      CREATOR_COMMANDS[interaction.commandName]
                    )

                  : mainPanel(bot);

        await interaction.channel.send(payload);

        return safeRespond(
          interaction,
          `✅ Panel publicado en <#${interaction.channelId}>. No se publicará al reiniciar Railway.`
        );

      } catch (error) {
        console.error(
          '[Tickets] Error al publicar el panel:',
          error
        );

        return safeRespond(
          interaction,
          `❌ No se pudo publicar el panel: ${error.message}`
        ).catch(console.error);
      }
    }

    // SELECTORES DE /9 SENSI
    const esMenuSensi =
      interaction.isStringSelectMenu() &&
      (
        interaction.customId.startsWith('gng:sensi:') ||
        interaction.customId === 'gng:haru:select'
      );

    if (esMenuSensi) {
      try {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const slug =
          interaction.customId === 'gng:haru:select'
            ? 'haru'
            : interaction.customId.split(':')[2];

        const categoria = interaction.values[0];

        const valida = Object.keys(SENSI_PLATFORMS)
          .some(
            plataforma =>
              categoria === `${slug}${plataforma}`
          );

        if (
          !SENSI_CREATORS[slug] ||
          !valida ||
          !CATEGORIES[categoria]
        ) {
          return safeRespond(
            interaction,
            'Selecciona un producto válido.'
          );
        }

        return await openTicket(
          interaction,
          categoria,
          bot
        );

      } catch (error) {
        console.error(
          '[Tickets] Error abriendo /9 SENSI:',
          error
        );

        return safeRespond(
          interaction,
          'No se pudo abrir el ticket. Comprueba los permisos del bot y revisa Railway.'
        ).catch(console.error);
      }
    }

    // MENÚ DE PAGOS
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith('gng:payment:')
    ) {
      try {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral,
        });

        const parts = interaction.customId.split(':');

        if (
          ![4, 5].includes(parts.length) ||
          !CATEGORIES[parts[2]] ||
          !/^\d{17,22}$/.test(parts[3]) ||
          (
            parts.length === 5 &&
            !/^\d{17,22}$/.test(parts[4])
          )
        ) {
          return safeRespond(
            interaction,
            'Menú de pagos desconocido.'
          );
        }

        const [
          ,
          ,
          category,
          ownerId,
          menuThreadId,
        ] = parts;

        const cfg = config();
        const thread = interaction.channel;

        if (
          cfg.missing.length ||
          !thread ||
          thread.type !== ChannelType.PrivateThread ||
          thread.parentId !== cfg.channelId ||
          thread.archived ||
          thread.locked ||
          (
            menuThreadId &&
            menuThreadId !== thread.id
          )
        ) {
          return safeRespond(
            interaction,
            'Este ticket ya no está disponible para enviar información de pagos.'
          );
        }

        // Compatibilidad con menús antiguos.
        if (
          !menuThreadId &&
          !await hiloPertenece(
            thread,
            category,
            ownerId,
            interaction.client.user.id
          )
        ) {
          return safeRespond(
            interaction,
            'El creador o la categoría no coinciden con este ticket.'
          );
        }

        const member =
          await interaction.guild.members.fetch(
            interaction.user.id
          );

        if (
          member.id !== ownerId &&
          !isTeam(member, category, cfg)
        ) {
          return safeRespond(
            interaction,
            'No tienes permiso para solicitar los métodos de pago en este ticket.'
          );
        }

        const chosen =
          PAYMENT_METHODS[interaction.values[0]];

        if (!chosen) {
          return safeRespond(
            interaction,
            'Elige un método de pago válido.'
          );
        }

        const embed = new EmbedBuilder()
          .setColor(0xff7a00)
          .setTitle(
            `${chosen.emoji} Método de pago: ${chosen.label}`
          )
          .setDescription(
            `${chosen.instructions}\n\n` +
            '📌 Verifica los datos con el staff antes de enviar dinero. El bot no confirma pagos automáticamente.'
          )
          .setFooter({
            text: '/9 GNG • Información de pago',
          });

        await thread.send({
          embeds: [embed],
          allowedMentions: {
            parse: [],
          },
        });

        return safeRespond(
          interaction,
          `✅ Envié los datos de **${chosen.label}** a este ticket.`
        );

      } catch (error) {
        console.error(
          '[Tickets] Error al enviar método de pago:',
          error
        );

        return safeRespond(
          interaction,
          '❌ No se pudo enviar el método de pago. Comprueba los permisos del bot.'
        ).catch(console.error);
      }
    }

    // BOTONES
    if (
      !interaction.isButton() ||
      !interaction.customId.startsWith('gng:')
    ) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const parts = interaction.customId.split(':');

      if (
        parts.length === 3 &&
        parts[1] === 'open' &&
        CATEGORIES[parts[2]]
      ) {
        return await openTicket(
          interaction,
          parts[2],
          bot
        );
      }

      if (
        parts.length === 4 &&
        [
          'call',
          'claim',
          'close',
          'pay',
          'admin',
        ].includes(parts[1]) &&
        CATEGORIES[parts[2]] &&
        /^\d{17,22}$/.test(parts[3])
      ) {
        return await onTicketAction(
          interaction,
          parts[1],
          parts[2],
          parts[3]
        );
      }

      return safeRespond(
        interaction,
        'Botón de tickets desconocido.'
      );

    } catch (error) {
      console.error(
        '[Tickets] Error:',
        error
      );

      return safeRespond(
        interaction,
        `❌ No se pudo completar la acción: ${error.message}`
      ).catch(console.error);
    }
  });
};

// ============================================================
// /boostpanel — RECOMPENSAS POR BOOSTS, SIN BOTONES
// Se conserva el módulo original de tickets.
// ============================================================

const configurarTicketsAnterior = module.exports;

module.exports = function configurarTicketsConBoost(bot) {
  configurarTicketsAnterior(bot);

  // Registrar /boostpanel sin publicar el anuncio automáticamente.
  bot.once(Events.ClientReady, async () => {
    const comandoBoost = new SlashCommandBuilder()
      .setName('boostpanel')
      .setDescription(
        'Publica las recompensas por mejorar el servidor'
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageGuild
      )
      .toJSON();

    for (const servidor of bot.guilds.cache.values()) {
      try {
        const comandos =
          await servidor.commands.fetch();

        if (
          !comandos.some(
            comando => comando.name === 'boostpanel'
          )
        ) {
          await servidor.commands.create(
            comandoBoost
          );

          console.log(
            `[Boost] /boostpanel registrado en ${servidor.name}`
          );
        }

      } catch (error) {
        console.error(
          '[Boost] Error al registrar el comando:',
          error
        );
      }
    }
  });

  // Publicar únicamente cuando ejecutes /boostpanel.
  bot.on(Events.InteractionCreate, async interaction => {
    if (
      !interaction.inGuild() ||
      !interaction.isChatInputCommand() ||
      interaction.commandName !== 'boostpanel'
    ) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        return interaction.editReply(
          '❌ Necesitas el permiso Gestionar servidor.'
        );
      }

      const nombreImagen = 'boost_server.png';

      const rutaImagen = path.join(
        __dirname,
        nombreImagen
      );

      if (!fs.existsSync(rutaImagen)) {
        return interaction.editReply(
          '❌ Falta boost_server.png junto a tickets.js en GitHub.'
        );
      }

      const panel = new EmbedBuilder()
        .setColor(0x318aff)
        .setTitle('⚡ BOOSTEA EL SERVIDOR')
        .setDescription([
          'Si mejoras el servidor, puedes reclamar recompensas por cada boost que hayas dado.',
          '',
          '**🎁 RECOMPENSAS**',
          '',
          '**1 |** Rol /9 | MUTE por 5 días',
          '**2 |** Rol Pase Libre permanente',
          '**3 |** Rol /9 | BOOST',
          '**4 |** Descuento del 7% (cada dos boosts)',
          '**5 |** Preferencia en tickets',
          '**6 |** Canal privado personalizado (mientras mantengas el boost)',
          '',
          '━━━━━━━━━━━━━━━━━━',
          '',
          '🎁 **Las recompensas se entregan después de verificar el boost.**',
        ].join('\n'))
        .setImage(
          `attachment://${nombreImagen}`
        )
        .setFooter({
          text: '/9 GNG • Recompensas por boosts',
        })
        .setTimestamp();

      await interaction.channel.send({
        embeds: [panel],

        files: [
          new AttachmentBuilder(rutaImagen, {
            name: nombreImagen,
          }),
        ],

        allowedMentions: {
          parse: [],
        },
      });

      await interaction.editReply(
        '✅ Panel de boosts publicado correctamente.'
      );

    } catch (error) {
      console.error(
        '[Boost] Error al publicar el panel:',
        error
      );

      const respuesta =
        '❌ No pude publicar el panel. Revisa los permisos y los registros de Railway.';

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply(respuesta)
          .catch(console.error);
      } else {
        await interaction.reply({
          content: respuesta,
          flags: MessageFlags.Ephemeral,
        }).catch(console.error);
      }
    }
  });
};

// ============================================================
// /9 GNG — MEJORADA MODI Y COMPLETA MODI
// PEGAR AL FINAL DE tickets.js
// No borra BASIC MODI ni los demás paneles.
// ============================================================

// Configuración de los dos productos.
const MODIS_NUEVAS = Object.freeze({
  mejoradamodi: {
    comando: 'mejoradapanel',
    nombre: 'MEJORADA MODI',
    imagen: 'mejorada_modi.png',
    beneficios: [
      'Estabilización de Mira',
      'Métodos para dar todo a la cabeza (full capa)',
      'HUDs exclusivos y configuraciones',
      'Modificación interna',
      'Sensi personalizada',
      'Auxilios de mira',
    ],
  },

  completamodi: {
    comando: 'completapanel',
    nombre: 'COMPLETA MODI',
    imagen: 'completa_modi.png',
    beneficios: [
      'Estabilización de Mira',
      'Métodos para dar todo a la cabeza (full capa)',
      'HUDs exclusivos y configuraciones',
      'Modificación interna personalizada',
      'Sensi personalizada',
      'Optimización para tener mejor rendimiento',
      'Auxilios de mira',
      'Atajos',
      'Sensi y métodos de famosos para dar full capa',
    ],
  },
});

// Registrar categorías independientes.
// Los tickets se identifican por producto.
for (const [categoria, producto] of Object.entries(MODIS_NUEVAS)) {
  CATEGORIES[categoria] = {
    label: producto.nombre,
    emoji: '🎯',
    button: ButtonStyle.Success,
    roles: [
      'mob',
      'director',
      'mod',
      'admin',
      'fundador',
    ],
  };
}

// ============================================================
// PERMISOS: /9 MOB Y SUPERIORES
// ============================================================

// Conservar los permisos anteriores de las demás categorías.
const isTeamAnteriorModi = isTeam;

isTeam = function (member, category, cfg) {
  if (!MODIS_NUEVAS[category]) {
    return isTeamAnteriorModi(member, category, cfg);
  }

  const rolMob = member.guild.roles.cache.get(cfg.roleIds.mob);

  return Boolean(
    rolMob &&
    member.roles.highest.comparePositionTo(rolMob) >= 0
  );
};

// Conservar la obtención de staff de las demás categorías.
const getStaffAnteriorModi = getStaff;

getStaff = async function (guild, category, cfg) {
  if (!MODIS_NUEVAS[category]) {
    return getStaffAnteriorModi(guild, category, cfg);
  }

  const rolMob = await guild.roles
    .fetch(cfg.roleIds.mob)
    .catch(() => null);

  if (!rolMob) {
    throw new Error(
      'No se encontró /9 MOB. Revisa ROL_MOB_ID en Railway.'
    );
  }

  const miembros = await guild.members.fetch();

  // Los hilos privados requieren añadir a cada miembro.
  return miembros.filter(
    miembro =>
      !miembro.user.bot &&
      miembro.roles.highest.comparePositionTo(rolMob) >= 0
  );
};

// ============================================================
// CREAR PANEL: IMAGEN + TEXTO + BOTÓN REAL
// ============================================================

function crearPanelModiNuevo(categoria) {
  const producto = MODIS_NUEVAS[categoria];

  if (!producto) {
    throw new Error('El producto MODI no existe.');
  }

  const rutaImagen = path.join(
    __dirname,
    producto.imagen
  );

  if (!fs.existsSync(rutaImagen)) {
    throw new Error(
      `Falta ${producto.imagen}. Súbela junto a tickets.js en GitHub.`
    );
  }

  // Imagen superior.
  const banner = new EmbedBuilder()
    .setColor(0xff7a00)
    .setImage(`attachment://${producto.imagen}`);

  // Texto del producto.
  const descripcion = [
    '**INCLUYE**',
    '',
    ...producto.beneficios.map(
      beneficio => `• ${beneficio}`
    ),
    '',
    '━━━━━━━━━━━━━━━━━━',
    '',
    '**🎫 ATENCIÓN Y ENTREGA**',
    'Abre un ticket privado para recibir atención.',
  ];

  const informacion = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle(producto.nombre)
    .setDescription(descripcion.join('\n'))
    .setFooter({
      text: `/9 GNG • ${producto.nombre}`,
    });

  // Botón funcional, no dibujado en la imagen.
  const boton = new ButtonBuilder()
    .setCustomId(`gng:open:${categoria}`)
    .setLabel('Abrir Ticket MODI')
    .setEmoji('🎫')
    .setStyle(ButtonStyle.Success);

  const fila = new ActionRowBuilder()
    .addComponents(boton);

  return {
    embeds: [
      banner,
      informacion,
    ],

    files: [
      new AttachmentBuilder(rutaImagen, {
        name: producto.imagen,
      }),
    ],

    components: [fila],

    allowedMentions: {
      parse: [],
    },
  };
}

// ============================================================
// CONECTAR LOS NUEVOS COMANDOS AL BOT EXISTENTE
// ============================================================

// Mantener la configuración anterior, incluido /boostpanel.
const configurarTicketsAntesDeModi = module.exports;

module.exports = function configurarTicketsConModis(bot) {
  configurarTicketsAntesDeModi(bot);

  // Registrar los dos comandos cuando el bot se conecte.
  bot.once(Events.ClientReady, async () => {
    for (const servidor of bot.guilds.cache.values()) {
      try {
        const registrados = await servidor.commands.fetch();

        for (const producto of Object.values(MODIS_NUEVAS)) {
          const comando = new SlashCommandBuilder()
            .setName(producto.comando)
            .setDescription(
              `Publica el panel de ${producto.nombre}`
            )
            .setDefaultMemberPermissions(
              PermissionFlagsBits.ManageGuild
            )
            .toJSON();

          const existente = registrados.find(
            item => item.name === producto.comando
          );

          if (!existente) {
            await servidor.commands.create(comando);

            console.log(
              `[MODI] /${producto.comando} registrado en ${servidor.name}`
            );
          }
        }
      } catch (error) {
        console.error(
          '[MODI] Error registrando comandos:',
          error
        );
      }
    }
  });

  // Publicar únicamente al ejecutar el comando.
  bot.on(Events.InteractionCreate, async interaction => {
    if (
      !interaction.inGuild() ||
      !interaction.isChatInputCommand()
    ) {
      return;
    }

    const categoria = Object.keys(MODIS_NUEVAS).find(
      clave =>
        MODIS_NUEVAS[clave].comando === interaction.commandName
    );

    if (!categoria) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        return interaction.editReply(
          '❌ Necesitas el permiso Gestionar servidor.'
        );
      }

      if (
        !interaction.channel ||
        typeof interaction.channel.send !== 'function'
      ) {
        return interaction.editReply(
          '❌ Este comando debe ejecutarse en un canal de texto.'
        );
      }

      const panel = crearPanelModiNuevo(categoria);

      await interaction.channel.send(panel);

      await interaction.editReply(
        `✅ Panel de ${MODIS_NUEVAS[categoria].nombre} publicado correctamente.`
      );

    } catch (error) {
      console.error(
        '[MODI] Error al publicar:',
        error
      );

      const respuesta =
        `❌ No se pudo publicar el panel: ${error.message}`;

      if (interaction.deferred || interaction.replied) {
        await interaction
          .editReply(respuesta)
          .catch(console.error);
      } else {
        await interaction.reply({
          content: respuesta,
          flags: MessageFlags.Ephemeral,
        }).catch(console.error);
      }
    }
  });
};
// ============================================================
// /9 GNG — PANEL SENSI ANDROID
// PEGAR AL FINAL DE tickets.js
// ============================================================

function sensiAndroidPanel() {
  const nombreImagen = 'android.png';
  const rutaImagen = path.join(__dirname, nombreImagen);

  if (!fs.existsSync(rutaImagen)) {
    throw new Error(
      'Falta android.png. Sube la imagen junto a tickets.js en GitHub.'
    );
  }

  // Imagen superior.
  const banner = new EmbedBuilder()
    .setColor(0xff7a00)
    .setImage('attachment://android.png');

  // Texto igual al de iOS, adaptado a Android.
  const producto = new EmbedBuilder()
    .setColor(0xff7a00)
    .setTitle('📱 SENSI /9 ANDROID')
    .setDescription([
      '🟠 Sensibilidad para todos los Android',
      '🟠 Estabilización de mira',
      '🟠 HUDs exclusivos y configuraciones',
      '🟠 Optimización para celular',
      '🟠 Métodos para dar todo a la cabeza (full capa)',
      '🟠 Mira 2x y 4x con arrastre directo a la cabeza',
      '🟠 Nuevas actualizaciones de sensibilidad',
      '',
      '━━━━━━━━━━━━━━━━━━',
      '**📦 ENTREGA**',
      'Atención y entrega mediante ticket privado.',
    ].join('\n'))
    .setFooter({
      text: '/9 GNG • Producto para Android',
    });

  // Botón funcional: utiliza el sistema Android/MOB existente.
  const boton = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gng:open:android')
      .setLabel('Abrir Ticket MOB')
      .setEmoji('🎫')
      .setStyle(ButtonStyle.Success)
  );

  return {
    embeds: [banner, producto],

    files: [
      new AttachmentBuilder(rutaImagen, {
        name: nombreImagen,
      }),
    ],

    components: [boton],

    allowedMentions: {
      parse: [],
    },
  };
}

// Mantener todos los módulos anteriores.
const configurarTicketsAntesDeAndroid = module.exports;

module.exports = function configurarTicketsConAndroid(bot) {
  configurarTicketsAntesDeAndroid(bot);

  // Registrar el comando.
  bot.once(Events.ClientReady, async () => {
    const comando = new SlashCommandBuilder()
      .setName('androidpanel')
      .setDescription('Publica SENSI /9 ANDROID con ticket MOB')
      .setDefaultMemberPermissions(
        PermissionFlagsBits.ManageGuild
      )
      .toJSON();

    for (const servidor of bot.guilds.cache.values()) {
      try {
        const registrados = await servidor.commands.fetch();

        if (!registrados.some(cmd => cmd.name === 'androidpanel')) {
          await servidor.commands.create(comando);
          console.log(
            `[Android] /androidpanel registrado en ${servidor.name}`
          );
        }
      } catch (error) {
        console.error('[Android] Error al registrar:', error);
      }
    }
  });

  // Publicar solamente cuando ejecutes /androidpanel.
  bot.on(Events.InteractionCreate, async interaction => {
    if (
      !interaction.inGuild() ||
      !interaction.isChatInputCommand() ||
      interaction.commandName !== 'androidpanel'
    ) {
      return;
    }

    try {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        return interaction.editReply(
          '❌ Necesitas el permiso Gestionar servidor.'
        );
      }

      await interaction.channel.send(sensiAndroidPanel());

      await interaction.editReply(
        '✅ Panel SENSI /9 ANDROID publicado correctamente.'
      );
    } catch (error) {
      console.error('[Android] Error:', error);

      const respuesta = `❌ ${error.message}`;

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(respuesta).catch(console.error);
      } else {
        await interaction.reply({
          content: respuesta,
          flags: MessageFlags.Ephemeral,
        }).catch(console.error);
      }
    }
  });
};
