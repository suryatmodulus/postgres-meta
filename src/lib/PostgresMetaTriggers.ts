import format, { ident, literal } from 'pg-format'
import { triggersSql } from './sql'
import { PostgresMetaResult, PostgresTrigger } from './types'
import PostgresMetaSchemas from './PostgresMetaSchemas'

export default class PostgresMetaTriggers {
  query: (sql: string) => Promise<PostgresMetaResult<any>>

  constructor(query: (sql: string) => Promise<PostgresMetaResult<any>>) {
    this.query = query
  }

  async list(): Promise<PostgresMetaResult<PostgresTrigger[]>> {
    return await this.query(enrichedTriggersSql)
  }

  async retrieve({ id }: { id: number }): Promise<PostgresMetaResult<PostgresTrigger[]>>
  async retrieve({
    name,
    schema,
    table,
  }: {
    name: string
    schema: string
    table: string
  }): Promise<PostgresMetaResult<PostgresTrigger[]>>
  async retrieve({
    id,
    name,
    schema,
    table,
  }: {
    id?: number
    name?: string
    schema?: string
    table?: string
  }): Promise<PostgresMetaResult<PostgresTrigger[]>> {
    if (id) {
      const sql = `${enrichedTriggersSql} WHERE triggers.id = ${literal(id)};`

      return await this.query(sql)
    }

    if (name && table) {
      const sql = `${enrichedTriggersSql} WHERE triggers.name = ${literal(
        name
      )} AND triggers.table = ${literal(table)} ${
        schema ? `AND triggers.schema = ${literal(schema)}` : ''
      };`

      return await this.query(sql)
    }

    return { data: null, error: { message: 'Missing id or name and table' } }
  }

  /**
   * Creates trigger
   *
   * @param {Object} obj - An object.
   * @param {string} obj.name - Trigger name.
   * @param {string} obj.table - Table, view, or foreign table name that trigger was created for.
   * @param {string} obj.function_name - Name of the function to execute. For example: 'public.audit_action'
   * @param {('before'|'after'|'instead of')} obj.timing - Determines when function is called
   * during event occurrence.
   * @param {string} obj.event - Event that will fire the trigger. One of the following 'insert' | 'update' | 'update
   * of column_name1,column_name2' | 'delete' | 'truncate' or multiple events using 'or' (For example: 'insert or update')
   * @param {('row'|'statement')} obj.orientation - Trigger function for every row affected by event or
   * once per statement. Defaults to 'statement'.
   * @param {string} obj.condition - Boolean expression that will trigger function.
   * For example: '(old.* is distinct from new.*)'
   * @param {string} obj.transition_relation_reference - Provide access to transition relations of triggering statement to function.
   * For example: 'referencing new table as newtable OLD TABLE AS oldtable'
   * @param {string} obj.function_arguments - comma-separated string of arguments to be passed to function when trigger is fired.
   * For example: 'arg1,arg2'
   * @param {('true'|'false')} obj.constraint - Creates a constraint trigger. By default, does not create a constraint trigger.
   * @param {string} obj.referenced_table_name - Name of another table referenced by constraint. Only applies to constraint triggers.
   * @param {('not deferrable'|'deferrable'|'deferrable initially immediate'|'deferrable initially deferred')} obj.default_timing - Name of another table referenced by constraint. Only applies to constraint triggers.
   */
  async create(
    {
      name,
      table,
      function_name,
      timing,
      event,
      orientation,
      condition,
      transition_relation_reference,
      function_arguments,
      constraint,
      referenced_table_name,
      default_timing,
    }: {
      name: string
      table: string
      function_name: string
      timing: string
      event: string
      orientation?: string
      condition?: string
      transition_relation_reference?: string
      function_arguments?: string
      constraint?: string
      referenced_table_name?: string
      default_timing?: string
    },
    { pgSchemas }: { pgSchemas: PostgresMetaSchemas }
  ): Promise<PostgresMetaResult<PostgresTrigger[]>> {
    let missingRequiredParam
    if (!name) missingRequiredParam = 'name'
    if (!table) missingRequiredParam = 'table'
    if (!function_name) missingRequiredParam = 'function_name'
    if (!timing) missingRequiredParam = 'timing'
    if (!event) missingRequiredParam = 'event'
    if (missingRequiredParam)
      return { data: null, error: { message: `Missing required param ${missingRequiredParam}` } }

    const { data: schemasData, error: schemasError } = await pgSchemas.list()
    const schemas = schemasData?.map(({ name }: { name: string }) => name)

    if (schemasError || !schemas) {
      return {
        data: null,
        error: schemasError || { message: 'Failed to retrieve existing schemas' },
      }
    }

    const splitQualifiedTableName = this.splitQualifiedTableName(schemas, table)
    const tableName = splitQualifiedTableName.map((n) => ident(n)).join('.')
    const functionName = this.splitQualifiedTableName(schemas, function_name)
      .map((n) => ident(n))
      .join('.')
    const refTableNameOpt = referenced_table_name
      ? `FROM ${this.splitQualifiedTableName(schemas, referenced_table_name)
          .map((n) => ident(n))
          .join('.')}`
      : ''

    const isContraintTrigger = constraint === 'true'
    const constraintOpt = isContraintTrigger ? 'CONSTRAINT' : ''
    const defaultTimingOpt = isContraintTrigger && default_timing ? `${ident(default_timing)}` : ''
    const transitionRelRefOpt = transition_relation_reference
      ? `${format.string(transition_relation_reference)}`
      : ''
    const actionOrientationOpt = orientation ? `FOR EACH ${ident(orientation)}` : ''
    const conditionOpt = condition ? `WHEN ${format.string(condition)}` : ''
    const functionArgs = function_arguments ? literal(function_arguments) : ''

    const sql = `CREATE ${constraintOpt} TRIGGER ${ident(name)} ${ident(timing)} ${format.string(
      event
    )} ON ${tableName} ${refTableNameOpt} ${defaultTimingOpt} ${transitionRelRefOpt} ${actionOrientationOpt} ${conditionOpt} EXECUTE FUNCTION ${functionName} ( ${functionArgs} );`

    const { error: createTriggerError } = await this.query(sql)

    if (createTriggerError) {
      return { data: null, error: createTriggerError }
    }

    return await this.retrieve({
      name,
      table: splitQualifiedTableName[1] ? splitQualifiedTableName[1] : splitQualifiedTableName[0],
      schema: splitQualifiedTableName[1] ? splitQualifiedTableName[0] : '',
    })
  }

  async update(
    id: number,
    {
      name: newName,
      extension,
      is_extension_dependent,
      is_enabled,
      enable_mode,
    }: {
      name?: string
      extension?: string
      is_extension_dependent?: 'true' | 'false'
      is_enabled?: 'true' | 'false'
      enable_mode?: 'replica' | 'always'
    }
  ): Promise<PostgresMetaResult<PostgresTrigger[]>> {
    const { data: triggerRecords, error } = await this.fetchTriggersById(id)

    if (error) {
      return { data: null, error }
    }

    let enableDisableSql = ''
    const { name: currentName, schema, table } = triggerRecords![0]
    const qualifiedTableName = `${ident(schema)}.${ident(table)}`
    const updateNameSql = newName
      ? `ALTER TRIGGER ${ident(currentName)} ON ${qualifiedTableName} RENAME TO ${ident(newName)};`
      : ''
    const updateExtDepSql =
      extension && ['true', 'false'].includes(is_extension_dependent || '')
        ? `ALTER TRIGGER ${ident(currentName)} ON ${qualifiedTableName} ${
            is_extension_dependent === 'false' ? 'NO' : ''
          } DEPENDS ON EXTENSION ${ident(extension)};`
        : ''

    if (is_enabled === 'false') {
      enableDisableSql = `ALTER TABLE ${qualifiedTableName} DISABLE TRIGGER ${ident(currentName)};`
    }

    if (is_enabled === 'true') {
      const enableMode =
        (enable_mode && ['replica', 'always'].includes(enable_mode) && ident(enable_mode)) || ''
      enableDisableSql = `ALTER TABLE ${qualifiedTableName} ENABLE ${enableMode} TRIGGER ${ident(
        currentName
      )};`
    }

    // updateNameSql must be last
    const sql = `BEGIN; ${enableDisableSql} ${updateExtDepSql} ${updateNameSql} COMMIT;`

    {
      const { error } = await this.query(sql)

      if (error) {
        return { data: null, error }
      }
    }

    return await this.retrieve({ id })
  }

  async remove(id: number, { cascade = false }): Promise<PostgresMetaResult<PostgresTrigger[]>> {
    const { data: triggerRecords, error } = await this.fetchTriggersById(id)

    if (error) {
      return { data: null, error }
    }

    const { name, schema, table } = triggerRecords![0]
    const qualifiedTableName = `${ident(schema)}.${ident(table)}`
    const sql = `DROP TRIGGER ${ident(name)} ON ${qualifiedTableName} ${cascade ? 'CASCADE' : ''};`

    {
      const { error } = await this.query(sql)

      if (error) {
        return { data: null, error }
      }
    }

    return { data: triggerRecords!, error: null }
  }

  private async fetchTriggersById(id: number): Promise<PostgresMetaResult<PostgresTrigger[]>> {
    const { data: triggers, error } = await this.retrieve({ id })
    const triggerRecord = Array.isArray(triggers) && triggers[0]

    if (error || !triggerRecord) {
      return { data: null, error: error || { message: `Trigger with id ${id} does not exist` } }
    }

    return { data: triggers!, error: null }
  }

  private splitQualifiedTableName(schemas: string[], name: string): string[] {
    const names = []
    const sortedDescSchemas = schemas.sort((a, b) => b.length - a.length)
    const len = sortedDescSchemas.length

    for (let i = 0; len; i++) {
      const schema = sortedDescSchemas[i]
      const schemaStartIdx = name.indexOf(schema)
      const splitIdx = schema.length
      if (schemaStartIdx === 0 && name[splitIdx] === '.') {
        names.push(name.slice(0, splitIdx))
        names.push(name.slice(splitIdx + 1))
        break
      }
    }

    return names[0] ? names : [name]
  }
}

const enrichedTriggersSql = `
WITH triggers AS (${triggersSql})
SELECT
  *
FROM triggers`
