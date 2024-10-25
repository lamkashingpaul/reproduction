import {
  Collection,
  Entity,
  ManyToOne,
  MikroORM,
  OneToMany,
  OneToOne,
  PrimaryKey,
  Property,
  QueryOrder,
  raw,
  Ref,
  wrap,
} from "@mikro-orm/sqlite";

@Entity()
class User {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @OneToOne(() => Shop, (shop) => shop.user, { ref: true, owner: true })
  shop!: Ref<Shop>;
}

@Entity()
class Shop {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;

  @OneToOne(() => User, (user) => user.shop, { ref: true })
  user!: Ref<User>;

  @OneToMany(() => Order, (order) => order.shop)
  orders = new Collection<Order>(this);
}

@Entity()
class Order {
  @PrimaryKey()
  id!: number;

  @Property()
  category!: string;

  @Property()
  time!: Date;

  @ManyToOne(() => Shop, { ref: true })
  shop!: Ref<Shop>;
}

let orm: MikroORM;

beforeAll(async () => {
  orm = await MikroORM.init({
    dbName: ":memory:",
    entities: [User, Shop, Order],
    debug: ["query", "query-params"],
    serialization: { forceObject: true },
    allowGlobalContext: true, // only for testing
  });
  await orm.schema.refreshDatabase();

  orm.em.create(User, {
    id: 1,
    name: "User 1",
    shop: {
      id: 1,
      name: "Shop 1",
      orders: [
        {
          id: 1,
          category: "A",
          time: new Date("2025-01-02T00:00:00Z"),
        },
        {
          id: 2,
          category: "B",
          time: new Date("2025-01-02T00:00:00Z"),
        },
        {
          id: 3,
          category: "A",
          time: new Date("2025-01-01T00:00:00Z"),
        },
        {
          id: 4,
          category: "B",
          time: new Date("2025-01-01T00:00:00Z"),
        },
      ],
    },
  });

  await orm.em.flush();
  orm.em.clear();
});

beforeEach(() => {
  orm.em.clear();
});

afterAll(async () => {
  await orm.close(true);
});

test("serialize orders fetched separately using find and populate", async () => {
  const users = await orm.em.find(User, {}, { populate: ["shop"] });

  const populatedUsers = await orm.em.populate(users, ["shop.orders"], {
    where: {
      shop: {
        orders: {
          category: "A",
        },
      },
    },
    orderBy: {
      shop: {
        orders: {
          time: QueryOrder.DESC,
        },
      },
    },
  });

  expect(wrap(populatedUsers[0]).toObject()).toEqual({
    id: 1,
    name: "User 1",
    shop: {
      id: 1,
      name: "Shop 1",
      user: { id: 1 },
      orders: [
        {
          id: 1,
          category: "A",
          time: new Date("2025-01-02T00:00:00Z"),
        },
        {
          id: 3,
          category: "A",
          time: new Date("2025-01-01T00:00:00Z"),
        },
      ],
    },
  });
});
