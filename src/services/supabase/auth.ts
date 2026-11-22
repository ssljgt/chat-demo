import { supabase } from './client.js'

/** 获取当前登录用户 */
export const getCurrentUser = async () => {
  const { data, error } = await supabase.auth.getUser()

  if (error) {
    throw error
  }

  return data.user
}

/** 发送邮箱验证码登录链接 */
export const signInWithEmail = async (email: string) => {
  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  })

  if (error) {
    throw error
  }

  return data
}

/** 退出登录 */
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw error
  }
}

/** 监听登录状态变化 */
export const onAuthStateChange = (
  callback: (event: string, session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => void
) => {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })

  return () => data.subscription.unsubscribe()
}