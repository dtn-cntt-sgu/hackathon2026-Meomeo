import type { ProjectFingerprint } from "@/contracts";
import { BAD_WORDS } from "@/lib/moderation";

export interface ForbiddenTechnology {
  name: string;
  keywords: readonly string[];
  patterns: readonly string[];
}

export const FORBIDDEN_TECHNOLOGIES: readonly ForbiddenTechnology[] = [
  {
    name: "redis",
    keywords: ["redis"],
    patterns: [
      "redis",
      "ioredis",
      "@redis/*",
      "aioredis",
      "bull",
      "bullmq",
      "connect-redis",
      "*spring-boot-starter-data-redis*",
      "*jedis*",
      "github.com/redis/go-redis*",
      "github.com/go-redis/redis*",
    ],
  },
  {
    name: "mongodb",
    keywords: ["mongodb", "mongo", "mongoose"],
    patterns: [
      "mongodb",
      "mongoose",
      "@nestjs/mongoose",
      "pymongo",
      "motor",
      "mongoengine",
      "*spring-boot-starter-data-mongodb*",
      "go.mongodb.org/mongo-driver*",
    ],
  },
  {
    name: "aws",
    keywords: ["aws", "dynamodb"],
    patterns: [
      "aws-sdk",
      "@aws-sdk/*",
      "aws-cdk-lib",
      "boto3",
      "botocore",
      "*software.amazon.awssdk*",
      "github.com/aws/aws-sdk-go*",
    ],
  },
  {
    name: "kafka",
    keywords: ["kafka"],
    patterns: [
      "kafkajs",
      "node-rdkafka",
      "kafka-python",
      "confluent-kafka",
      "aiokafka",
      "*spring-kafka*",
      "*kafka-clients*",
      "github.com/segmentio/kafka-go*",
    ],
  },
  {
    name: "rabbitmq",
    keywords: ["rabbitmq", "amqp"],
    patterns: [
      "amqplib",
      "amqp-connection-manager",
      "pika",
      "aio-pika",
      "*spring-boot-starter-amqp*",
      "github.com/rabbitmq/amqp091-go*",
    ],
  },
  {
    name: "graphql",
    keywords: ["graphql", "apollo"],
    patterns: [
      "graphql",
      "@apollo/*",
      "apollo-server*",
      "graphql-yoga",
      "type-graphql",
      "@nestjs/graphql",
      "graphene",
      "strawberry-graphql",
      "github.com/99designs/gqlgen*",
    ],
  },
  {
    name: "grpc",
    keywords: ["grpc"],
    patterns: [
      "grpc",
      "@grpc/*",
      "grpcio",
      "*io.grpc*",
      "google.golang.org/grpc*",
    ],
  },
  {
    name: "elasticsearch",
    keywords: ["elasticsearch", "opensearch"],
    patterns: [
      "elasticsearch",
      "@elastic/elasticsearch",
      "elasticsearch-dsl",
      "@opensearch-project/opensearch",
      "opensearch-py",
      "github.com/elastic/go-elasticsearch*",
    ],
  },
  {
    name: "docker",
    keywords: ["docker", "dockerfile", "docker compose"],
    patterns: [
      "docker",
      "dockerode",
      "testcontainers",
      "@testcontainers/*",
    ],
  },
  {
    name: "kubernetes",
    keywords: ["kubernetes", "k8s", "kubectl"],
    patterns: [
      "kubernetes",
      "@kubernetes/client-node",
      "k8s.io/client-go*",
    ],
  },
  {
    name: "microservices",
    keywords: ["microservice", "microservices", "vi dịch vụ"],
    patterns: [
      "@nestjs/microservices",
      "moleculer",
      "seneca",
      "github.com/micro/*",
      "*spring-cloud-*",
    ],
  },
  {
    name: "serverless",
    keywords: ["serverless", "aws lambda", "cloud functions"],
    patterns: [
      "serverless",
      "serverless-http",
      "@serverless/*",
      "aws-lambda",
      "@types/aws-lambda",
      "zappa",
      "chalice",
      "firebase-functions",
      "@google-cloud/functions-framework",
    ],
  },
];

function matchGlob(pattern: string, target: string): boolean {
  const p = pattern.toLowerCase();
  const t = target.toLowerCase();
  const regexStr =
    "^" +
    p
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*") +
    "$";
  return new RegExp(regexStr).test(t);
}

export function wordRe(k: string): RegExp {
  const escaped = k
    .normalize("NFC")
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu");
}

export function forbiddenKeywords(
  fp: ProjectFingerprint,
  codeText: string,
): string[] {
  const techStack = fp.tech_stack ?? [];
  const bannedKeywords: string[] = [];

  for (const tech of FORBIDDEN_TECHNOLOGIES) {
    const matchPkg = tech.patterns.some((pattern) =>
      techStack.some((pkg) => matchGlob(pattern, pkg)),
    );
    const matchCode = tech.keywords.some((kw) =>
      wordRe(kw).test(codeText.normalize("NFC")),
    );

    if (!matchPkg && !matchCode) {
      bannedKeywords.push(...tech.keywords);
    }
  }

  return bannedKeywords;
}

export const findForbidden = (
  texts: string[],
  keywords: string[],
): string[] => {
  const combined = [
    ...keywords,
    ...BAD_WORDS.filter((b) => !keywords.includes(b)),
  ];
  return combined.filter((k) =>
    texts.some((t) => wordRe(k).test(t.normalize("NFC"))),
  );
};
