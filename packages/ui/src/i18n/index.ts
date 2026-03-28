export type Locale = 'en-US' | 'zh-CN'

export interface Translations {
	ready: string
	running: string
	completed: string
	error: string
	taskPlaceholder: string
	startButton: string
	stopButton: string
	historyTitle: string
	exportHistory: string
	rerunTask: string
	step: string
	thinking: string
	executing: string
	noHistory: string
	askingUser: string
	submitAnswer: string
	answerPlaceholder: string
	closePanel: string
	settings: string
	model: string
	apiKey: string
	baseUrl: string
	maxSteps: string
	save: string
}

const en: Translations = {
	ready: 'Ready',
	running: 'Running…',
	completed: 'Completed',
	error: 'Error',
	taskPlaceholder: 'Describe what you want to do on this page…',
	startButton: 'Start',
	stopButton: 'Stop',
	historyTitle: 'History',
	exportHistory: 'Export JSON',
	rerunTask: 'Rerun',
	step: 'Step',
	thinking: 'Thinking…',
	executing: 'Executing',
	noHistory: 'No tasks yet.',
	askingUser: 'Question for you:',
	submitAnswer: 'Submit',
	answerPlaceholder: 'Your answer…',
	closePanel: 'Close',
	settings: 'Settings',
	model: 'Model',
	apiKey: 'API Key',
	baseUrl: 'API Base URL',
	maxSteps: 'Max Steps',
	save: 'Save',
}

const zh: Translations = {
	ready: '就绪',
	running: '执行中…',
	completed: '已完成',
	error: '错误',
	taskPlaceholder: '描述您想在此页面执行的操作…',
	startButton: '开始',
	stopButton: '停止',
	historyTitle: '历史记录',
	exportHistory: '导出 JSON',
	rerunTask: '重新执行',
	step: '步骤',
	thinking: '思考中…',
	executing: '执行',
	noHistory: '暂无任务。',
	askingUser: '需要您回答：',
	submitAnswer: '提交',
	answerPlaceholder: '您的回答…',
	closePanel: '关闭',
	settings: '设置',
	model: '模型',
	apiKey: 'API 密钥',
	baseUrl: 'API 地址',
	maxSteps: '最大步数',
	save: '保存',
}

const locales: Record<Locale, Translations> = { 'en-US': en, 'zh-CN': zh }

export function getTranslations(locale: Locale = 'en-US'): Translations {
	return locales[locale] ?? en
}
