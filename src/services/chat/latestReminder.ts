
import { getRegionName, provinces, type UserLocation } from '../location.js'
import type { Locale } from '../settings.js'
import { formatDate } from '../../utils/format.js'
import { translate } from '../../i18n/index.js'

const locationName = (location: UserLocation | null, locale: Locale): string => {
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

/** DeepSeek 要求的五项信息；日期与星期使用设备本地时区。 */
export const createLatestReminder = (
  { locale, location }: { locale: Locale; location: UserLocation | null },
  now = new Date()
): string => {
  const date = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
  }).format(now)

  const place = locationName(location, locale)
  const platform = 'Web'
  const language = translate('latestReminderLanguage')

  return [
    date,
    weekday,
    place,
    platform,
    language,
  ].join(',')
}
