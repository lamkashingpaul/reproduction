import "reflect-metadata";
import {
  Entity,
  MikroORM,
  PrimaryKey,
  Property,
  raw,
  ReflectMetadataProvider,
} from "@mikro-orm/sqlite";

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
  await orm.schema.refreshDatabase();

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

test("tuple $in on a raw() key", async () => {
  const qb = orm.em
    .createQueryBuilder(Tool, "tool")
    .select(["id", "classId", "roleId"])
    .where({
      [raw("(`tool`.`class_id`, `tool`.`role_id`)")]: { $in: tuples },
    });

  expect(qb.getFormattedQuery()).toBe(
    "select `tool`.`id`, `tool`.`class_id`, `tool`.`role_id` from `tool` as `tool` " +
      "where (`tool`.`class_id`, `tool`.`role_id`) in ( values (-1, -1), (1, 1), (2, 2))",
  );

  const rows = await qb.getResult();
  expect(rows.map((r) => [r.classId, r.roleId])).toEqual([
    [1, 1],
    [2, 2],
  ]);
});
