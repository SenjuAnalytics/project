// The links a creator attaches to a launch.
//
// These are the only thing a buyer has to tell a real project from someone who typed anything into the
// box, and they go on chain permanently. A field labelled Twitter holding a block explorer link, or a
// Discord field holding a channel URL only existing members can open, is worse than an empty field: it
// looks like verification and is not.
//
// So the platform fields are not URL boxes at all. The site is a fixed prefix the creator cannot edit,
// and all they type is the handle — no scheme, no host, no slashes, nothing after the username. Pasting a
// full profile URL still works: the handle is lifted out of it. Pasting the wrong site's URL does not.

export type SocialKind =
  | 'website'
  | 'twitter'
  | 'telegram'
  | 'discord'
  | 'github'
  | 'youtube'
  | 'reddit'
  | 'linktree'
  | 'url'

export type HandleRule = {
  /** Fixed text shown in front of the input. Absent for kinds that take a whole URL. */
  prefix?: string
  /** Hosts a pasted URL may come from, so the handle can be lifted out of it. */
  hosts?: string[]
  placeholder: string
  /** What the field is called in a message. */
  label: string
}

export const SOCIAL_RULES: Record<SocialKind, HandleRule> = {
  website:  { placeholder: 'https://yourproject.io', label: 'Website' },
  twitter:  { prefix: 'x.com/',        hosts: ['x.com', 'twitter.com', 'mobile.twitter.com'], placeholder: 'yourproject', label: 'X' },
  telegram: { prefix: 't.me/',         hosts: ['t.me', 'telegram.me', 'telegram.dog'],        placeholder: 'yourproject', label: 'Telegram' },
  discord:  { prefix: 'discord.gg/',   hosts: ['discord.gg', 'discord.com', 'discordapp.com'], placeholder: 'yourinvite', label: 'Discord' },
  github:   { prefix: 'github.com/',   hosts: ['github.com'],                                  placeholder: 'yourproject', label: 'GitHub' },
  youtube:  { prefix: 'youtube.com/@', hosts: ['youtube.com', 'm.youtube.com', 'youtu.be'],    placeholder: 'yourchannel', label: 'YouTube' },
  reddit:   { prefix: 'reddit.com/r/', hosts: ['reddit.com', 'old.reddit.com', 'www.reddit.com'], placeholder: 'yoursubreddit', label: 'Reddit' },
  linktree: { prefix: 'linktr.ee/',    hosts: ['linktr.ee'],                                   placeholder: 'yourproject', label: 'Linktree' },
  url:      { placeholder: 'https://…', label: 'Link' },
}

export type Checked = { ok: true; handle: string; url: string } | { ok: false; reason: string }

/** Paths on x.com that are features of the site rather than somebody's account. */
const X_RESERVED = new Set([
  'i', 'intent', 'home', 'explore', 'search', 'hashtag', 'share', 'messages',
  'notifications', 'settings', 'compose', 'login', 'signup', 'tos', 'privacy', 'about',
])
/** Telegram names that belong to the app itself. */
const TG_RESERVED = new Set(['c', 's', 'share', 'addstickers', 'proxy', 'socks', 'setlanguage', 'iv'])

// Invisible characters ride along with anything pasted from a web page, so they are dropped
// silently. Real whitespace inside a handle is not: joining two words into one username
// would be a guess about what the creator meant.
const clean = (raw: string) => raw.replace(/[\u200B-\u200D\uFEFF]/g, '').trim()

function parseUrl(value: string): URL | undefined {
  // A scheme other than http(s) is never a link to publish — javascript: and data: above all.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:/i.test(value)) return undefined
  try {
    return new URL(/^https?:/i.test(value) ? value : `https://${value}`)
  } catch {
    return undefined
  }
}

const hostOf = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, '')

/**
 * Reduces whatever was typed or pasted to a bare handle.
 *
 * Returns the handle, or a reason it cannot be one. This runs on every keystroke, so a value that is
 * merely incomplete has to read as incomplete rather than wrong.
 */
function toHandle(kind: SocialKind, raw: string): Checked {
  const rule = SOCIAL_RULES[kind]
  let value = clean(raw).replace(/^@+/, '')
  if (!value) return { ok: false, reason: '' }

  // A pasted URL is lifted apart rather than rejected — it is the most natural thing to paste.
  if (value.includes('/') || value.includes('.')) {
    const url = parseUrl(value)
    if (!url) return { ok: false, reason: `Type the handle only, without ${rule.prefix ?? 'a scheme'}.` }
    const host = hostOf(url)

    if (!rule.hosts?.includes(host)) {
      // Not a URL at all, just a handle that happens to contain a dot or slash.
      if (!value.includes('://') && !rule.hosts?.some(h => value.toLowerCase().startsWith(h))) {
        return { ok: false, reason: 'A handle cannot contain "/" or "."' }
      }
      return { ok: false, reason: `This field takes ${rule.label}, not ${host}.` }
    }

    const parts = url.pathname.split('/').filter(Boolean)
    if (parts.length === 0) return { ok: false, reason: `That is the ${rule.label} home page, not a profile.` }

    switch (kind) {
      case 'twitter':
        if (parts.length > 1) {
          return { ok: false, reason: parts[1].toLowerCase() === 'status' ? 'Link the profile, not a single post.' : 'Link the profile itself.' }
        }
        value = parts[0]
        break
      case 'telegram':
        if (parts[0].startsWith('+')) return finish(kind, parts[0])
        if (parts[0].toLowerCase() === 'joinchat' && parts[1]) return finish(kind, `joinchat/${parts[1]}`)
        if (TG_RESERVED.has(parts[0].toLowerCase())) return { ok: false, reason: 'That link only opens for people already in the group.' }
        if (parts.length > 1) return { ok: false, reason: 'Link the group, not a single message.' }
        value = parts[0]
        break
      case 'discord':
        if (host === 'discord.gg') value = parts[0]
        else if (parts[0].toLowerCase() === 'channels') return { ok: false, reason: 'That is a channel link. Use an invite.' }
        else if (parts[0].toLowerCase() === 'invite' && parts[1]) value = parts[1]
        else return { ok: false, reason: 'Use a Discord invite link.' }
        break
      case 'github':
        value = parts[0]
        break
      case 'youtube':
        if (host === 'youtu.be') return { ok: false, reason: 'That is a video link. Link the channel.' }
        if (parts[0].startsWith('@')) value = parts[0].slice(1)
        else if (parts[0].toLowerCase() === 'c' && parts[1]) value = parts[1]
        else if (parts[0].toLowerCase() === 'watch' || parts[0].toLowerCase() === 'shorts') {
          return { ok: false, reason: 'That is a video link. Link the channel.' }
        } else value = parts[0]
        break
      case 'reddit':
        if (parts[0].toLowerCase() !== 'r' || !parts[1]) return { ok: false, reason: 'Link a subreddit, for example reddit.com/r/yourproject.' }
        if (parts.length > 2) return { ok: false, reason: 'Link the subreddit, not a single post.' }
        value = parts[1]
        break
      case 'linktree':
        value = parts[0]
        break
      default:
        break
    }
  }

  return finish(kind, value)
}

/** Applies the per-platform shape rules to a bare handle. */
function finish(kind: SocialKind, handle: string): Checked {
  const rule = SOCIAL_RULES[kind]

  if (handle.includes('/') && !(kind === 'telegram' && handle.startsWith('joinchat/'))) {
    return { ok: false, reason: 'A handle cannot contain "/"' }
  }

  switch (kind) {
    case 'twitter':
      if (X_RESERVED.has(handle.toLowerCase())) return { ok: false, reason: 'That is an X page, not a profile.' }
      if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) {
        return { ok: false, reason: 'An X handle is 1-15 characters: letters, numbers and underscores.' }
      }
      break
    case 'telegram':
      if (handle.startsWith('+') || handle.startsWith('joinchat/')) break
      if (!/^[A-Za-z0-9_]{4,32}$/.test(handle)) {
        return { ok: false, reason: 'A Telegram name is 4-32 characters: letters, numbers and underscores.' }
      }
      break
    case 'discord':
      if (!/^[A-Za-z0-9-]{2,32}$/.test(handle)) return { ok: false, reason: 'That invite code does not look right.' }
      break
    case 'github':
      if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(handle)) {
        return { ok: false, reason: 'A GitHub name is letters, numbers and hyphens.' }
      }
      break
    case 'youtube':
      if (!/^[A-Za-z0-9._-]{3,30}$/.test(handle)) return { ok: false, reason: 'A YouTube handle is 3-30 characters.' }
      break
    case 'reddit':
      if (!/^[A-Za-z0-9_]{3,21}$/.test(handle)) return { ok: false, reason: 'A subreddit name is 3-21 characters.' }
      break
    case 'linktree':
      if (!/^[A-Za-z0-9._-]{2,30}$/.test(handle)) return { ok: false, reason: 'That Linktree name does not look right.' }
      break
    default:
      break
  }

  return { ok: true, handle, url: `https://${rule.prefix}${handle}` }
}

/** Checks a field that takes a whole address rather than a handle. */
function checkUrl(kind: SocialKind, raw: string): Checked {
  const value = clean(raw)
  if (!value) return { ok: false, reason: '' }
  const url = parseUrl(value)
  if (!url) return { ok: false, reason: 'Enter a web address starting with https://' }
  if (!url.hostname.includes('.') || url.username || url.password) {
    return { ok: false, reason: 'That does not look like a web address.' }
  }
  const clean_ = url.toString().replace(/\/$/, '')
  return { ok: true, handle: clean_, url: clean_ }
}

/**
 * Checks one field. An empty field is valid — every link is optional — and reports an empty handle.
 * `reason` is an empty string while a field is merely incomplete, so the interface can stay quiet
 * until there is something worth saying.
 */
export function checkSocial(kind: SocialKind, raw: string): Checked {
  if (!clean(raw)) return { ok: true, handle: '', url: '' }
  return SOCIAL_RULES[kind].prefix ? toHandle(kind, raw) : checkUrl(kind, raw)
}
