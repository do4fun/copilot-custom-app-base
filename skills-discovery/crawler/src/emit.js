const emit = (obj) => process.stdout.write(JSON.stringify(obj) + '\n')

export const log     = (msg)   => emit({ type: 'log', msg })
export const setTotal = (value) => emit({ type: 'total', value })
export const skill   = (data)  => emit({ type: 'skill', data })
export const done    = (found) => emit({ type: 'done', found })
