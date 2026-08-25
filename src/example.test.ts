import "reflect-metadata";
import {
  Entity,
  PrimaryKey,
  Property,
  ReflectMetadataProvider,
} from "@mikro-orm/decorators/legacy";
import { MikroORM, raw } from "@mikro-orm/sqlite";

@Entity()
class Tool {
  @PrimaryKey()
  id!: number;

  @Property()
  classId: number;

  @Property()
  roleId: number;

  constructor(classId: number, roleId: number) {
    this.classId = classId;
    this.roleId = roleId;
  }
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    dbName: ":memory:",
    entities: [Tool],
    metadataProvider: ReflectMetadataProvider,
    debug: ["query", "query-params"],
    allowGlobalContext: true, // only for testing
  });
  await orm.schema.refresh();

  orm.em.create(Tool, { classId: 1, roleId: 1 });
  orm.em.create(Tool, { classId: 1, roleId: 2 });
  orm.em.create(Tool, { classId: 2, roleId: 1 });
  orm.em.create(Tool, { classId: 2, roleId: 2 });
  await orm.em.flush();
  orm.em.clear();
});

afterAll(async () => {
  await orm.close(true);
});

// A row-value (tuple) `IN` comparison: `(a, b) in ((1, 1), (2, 2))`.
// The pairs are meaningful together — `classId in (1, 2) and roleId in (1, 2)`
// is a different, wider condition.
const tuples = [
  [-1, -1], // sentinel so the list is never empty
  [1, 1],
  [2, 2],
];

// Unchanged from the v6 baseline (see the first of the three commits), other than
// the expected SQL.
//
// v7 regressed this by flattening the array of tuples one level, losing the
// row-value structure and producing SQL the driver rejects outright:
//
//   sqlite: SqliteError: IN(...) element has 1 term - expected 2
//   mysql:  Operand should contain 2 column(s)
//
// The fix restores the row-value comparison. The rendering is the portable
// `((a, b), ...)` form rather than the `( values (a, b), ...)` knex emitted in
// v6 — it is what v7 already emits for composite (non-raw) keys, and unlike the
// `values` spelling it also works on MySQL before 8.0.19:
//
//   v6:    where (`tool`.`class_id`, `tool`.`role_id`) in ( values (-1, -1), (1, 1), (2, 2))
//   v7:    where (`tool`.`class_id`, `tool`.`role_id`) in (-1, -1, 1, 1, 2, 2)          <- broken
//   fixed: where (`tool`.`class_id`, `tool`.`role_id`) in ((-1, -1), (1, 1), (2, 2))
test("tuple $in on a raw() key", async () => {
  const qb = orm.em
    .createQueryBuilder(Tool, "tool")
    .select(["id", "classId", "roleId"])
    .where({
      [raw("(`tool`.`class_id`, `tool`.`role_id`)")]: { $in: tuples },
    });

  expect(qb.getFormattedQuery()).toBe(
    "select `tool`.`id`, `tool`.`class_id`, `tool`.`role_id` from `tool` as `tool` " +
      "where (`tool`.`class_id`, `tool`.`role_id`) in ((-1, -1), (1, 1), (2, 2))",
  );

  const rows = await qb.getResult();
  expect(rows.map((r) => [r.classId, r.roleId])).toEqual([
    [1, 1],
    [2, 2],
  ]);
});
