/** @flow */
import fs from 'fs';
import R from 'ramda';
import path from 'path';
import AbstractBitJson from './abstract-bit-json';
import { BitJsonNotFound, BitJsonAlreadyExists } from './exceptions';
import { BIT_JSON, DEFAULT_DIST_DIRNAME, DEFAULT_DIST_ENTRY, DEFAULT_DIR_STRUCTURE } from '../../constants';

function composePath(bitPath: string) {
  return path.join(bitPath, BIT_JSON);
}

function hasExisting(bitPath: string): boolean {
  return fs.existsSync(composePath(bitPath));
}

export default class ConsumerBitJson extends AbstractBitJson {
  distEntry: string;  // base path to copy the dist structure from
  distTarget: string; // path where to store build artifacts
  structure: string;  // directory structure template where to store imported components

  constructor({ impl, spec, compiler, tester, dependencies, lang, distTarget, distEntry, structure }) {
    super({ impl, spec, compiler, tester, dependencies, lang });
    this.distTarget = distTarget || DEFAULT_DIST_DIRNAME;
    this.distEntry = distEntry || DEFAULT_DIST_ENTRY;
    this.structure = structure || DEFAULT_DIR_STRUCTURE;
  }

  toPlainObject() {
    const superObject = super.toPlainObject();
    return R.merge(superObject, {
      structure: this.structure,
      dist: {
        target: this.distTarget,
        entry: this.distEntry,
      },
    });
  }

  write({ bitDir, override = true }: { bitDir: string, override?: boolean }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!override && hasExisting(bitDir)) {
        throw new BitJsonAlreadyExists();
      }

      const respond = (err, res) => {
        if (err) return reject(err);
        return resolve(res);
      };

      fs.writeFile(
        composePath(bitDir),
        this.toJson(),
        respond
      );
    });
  }

  static create(): ConsumerBitJson {
    return new ConsumerBitJson({});
  }

  static ensure(dirPath): Promise<ConsumerBitJson> {
    return new Promise((resolve) => {
      return this.load(dirPath)
        .then(resolve)
        .catch(() => resolve(this.create()));
    });
  }

  static fromPlainObject(object: Object) {
    const { sources, env, dependencies, lang, structure, dist } = object;
    return new ConsumerBitJson({
      impl: R.propOr(undefined, 'impl', sources),
      spec: R.propOr(undefined, 'spec', sources),
      compiler: R.propOr(undefined, 'compiler', env),
      tester: R.propOr(undefined, 'tester', env),
      lang,
      dependencies,
      structure,
      distTarget: R.propOr(undefined, 'target', dist),
      distEntry: R.propOr(undefined, 'entry', dist),
    });
  }

  static load(dirPath: string): Promise<ConsumerBitJson> {
    return new Promise((resolve, reject) => {
      if (!hasExisting(dirPath)) return reject(new BitJsonNotFound());
      return fs.readFile(composePath(dirPath), (err, data) => {
        if (err) return reject(err);
        const file = JSON.parse(data.toString('utf8'));
        return resolve(this.fromPlainObject(file));
      });
    });
  }
}
