
import { getRegionName, provinces, type UserLocation } from '../location.js'
import type { Locale } from '../settings.js'
import { translate } from '../../i18n/index.js'

const locationName = (
  location: UserLocation | null,
  locale: Locale
): string => {
  if (!location) {
    return ''
  }

  if (location.region === 'CN' && locale === 'zh-CN') {
    const province = provinces.find((item) => item.code === location.province)
    const city = province?.cities.find((item) => item.code === location.city)
    return city?.name ?? province?.name ?? getRegionName('CN', locale)
  }

  return getRegionName(location.region, locale)
}

/** 保存每轮请求的设备本地时间、时区及其他上下文信息。 */
export const createLatestReminder = (
  { locale, location }: { locale: Locale; location: UserLocation | null },
  now = new Date()
): string => {
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now)

  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown'

  const offsetMinutes = -now.getTimezoneOffset()
  const offsetSign = offsetMinutes >= 0 ? '+' : '-'
  const offsetHours = String(
    Math.floor(Math.abs(offsetMinutes) / 60)
  ).padStart(2, '0')
  const offsetRemainder = String(
    Math.abs(offsetMinutes) % 60
  ).padStart(2, '0')

  const utcOffset = `UTC${offsetSign}${offsetHours}:${offsetRemainder}`

  const place = locationName(location, locale)
  const platform = 'Web'
  const language = translate('latestReminderLanguage')

  return [
    `设备本地日期和时间：${dateTime}`,
    `设备时区：${timeZone}（${utcOffset}）`,
    `地区：${place || '未提供'}`,
    `平台：${platform}`,
    `语言：${language}`,
    '相对时间计算请以以上设备本地时间为基准，并考虑跨日情况。',
    '不要根据时区擅自推断用户的具体地理位置。',
  ].join('\n')
}
