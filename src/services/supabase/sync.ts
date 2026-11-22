
import { supabase } from './client.js'
import type { Session, Message } from '../chat/types.js'

/** 已成功同步的消息快照，用于避免重复上传 */
const syncedMessages = new Map<string, string>()

/** 同步状态 */
const inFlight = new Map<string, Promise<void>>()
const queuedSessions = new Map<string, Session>()
const lastSyncAt = new Map<string, number>()
const scheduledTasks = new Map<string, ReturnType<typeof setTimeout>>()

/** 流式回复期间的同步间隔 */
const STREAM_SYNC_INTERVAL = 10_000

/** 判断会话是否仍有正在生成的回复 */
const isSessionStreaming = (session: Session) =>
  session.messages.some(
    (message) =>
      message.role === 'assistant' &&
      (message.status === 'pending' || message.status === 'streaming')
  )

/** 将本地消息转换为数据库记录 */
const getMessagePayload = (message: Message) => {
  if (message.role === 'user') {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      blocks: null,
      metadata: {
        files: message.files,
      },
      parent_id: message.parentId ?? null,
      selected_child_id: message.selectedChildId ?? null,
      created_at: message.createdAt,
    }
  }

  return {
    id: message.id,
    role: message.role,
    content: message.blocks
      .map((block) => block.type === 'text' ? block.text : '')
      .join(''),
    blocks: message.blocks,
    metadata: {
      serverMessageId: message.serverMessageId,
      model: message.model,
      thinking: message.thinking,
      search: message.search,
      latestReminder: message.latestReminder,
      prefix: message.prefix,
      status: message.status,
      stopReason: message.stopReason,
      stopDetails: message.stopDetails,
      usage: message.usage,
      error: message.error,
    },
    parent_id: message.parentId ?? null,
    selected_child_id: message.selectedChildId ?? null,
    created_at: message.createdAt,
  }
}

/** 将一个会话快照同步到 Supabase */
const syncSnapshot = async (session: Session) => {
  const { data, error: authError } = await supabase.auth.getUser()

  if (authError) {
    throw authError
  }

  const user = data.user

  if (!user) {
    throw new Error('请先登录云端账号')
  }

  const { error: conversationError } = await supabase
    .from('conversations')
    .upsert(
      {
        id: session.id,
        user_id: user.id,
        title: session.title,
        created_at: session.createdAt,
        updated_at: session.updatedAt,
        root_message_id: session.rootMessageId ?? null,
      },
      { onConflict: 'id' }
    )

  if (conversationError) {
    throw conversationError
  }

  const changedMessages = session.messages
    .map((message) => ({
      message,
      payload: getMessagePayload(message),
    }))
    .filter(({ message, payload }) => {
      const key = `${user.id}:${session.id}:${message.id}`
      return syncedMessages.get(key) !== JSON.stringify(payload)
    })

  if (changedMessages.length === 0) {
    return
  }

  const rows = changedMessages.map(({ payload }) => ({
    ...payload,
    conversation_id: session.id,
  }))

  const { error: messageError } = await supabase
    .from('messages')
    .upsert(rows, { onConflict: 'id' })

  if (messageError) {
    throw messageError
  }

  for (const { message, payload } of changedMessages) {
    const key = `${user.id}:${session.id}:${message.id}`
    syncedMessages.set(key, JSON.stringify(payload))
  }
}

/** 执行排队中的同步任务 */
const runQueuedSync = (sessionId: string): Promise<void> => {
  const existingTask = inFlight.get(sessionId)

  if (existingTask) {
    return existingTask.then(() => runQueuedSync(sessionId))
  }

  const session = queuedSessions.get(sessionId)

  if (!session) {
    return Promise.resolve()
  }

  const scheduledTask = scheduledTasks.get(sessionId)

  if (!isSessionStreaming(session)) {
    if (scheduledTask) {
      clearTimeout(scheduledTask)
      scheduledTasks.delete(sessionId)
    }
  } else {
    const lastSync = lastSyncAt.get(sessionId) ?? 0
    const remaining = STREAM_SYNC_INTERVAL - (Date.now() - lastSync)

    if (remaining > 0) {
      if (!scheduledTask) {
        const timer = setTimeout(() => {
          scheduledTasks.delete(sessionId)
          void runQueuedSync(sessionId).catch((error: unknown) => {
            console.error('Cloud sync failed:', error)
          })
        }, remaining)

        scheduledTasks.set(sessionId, timer)
      }

      return Promise.resolve()
    }
  }

  queuedSessions.delete(sessionId)

  const task = syncSnapshot(session)
    .then(() => {
      lastSyncAt.set(sessionId, Date.now())
    })
    .finally(() => {
      inFlight.delete(sessionId)

      if (queuedSessions.has(sessionId)) {
        void runQueuedSync(sessionId).catch((error: unknown) => {
          console.error('Cloud sync failed:', error)
        })
      }
    })

  inFlight.set(sessionId, task)

  return task
}

/** 同步一个会话；流式期间节流，回复结束后立即同步 */
export const syncSession = (session: Session): Promise<void> => {
  queuedSessions.set(session.id, session)

  return runQueuedSync(session.id)
}
