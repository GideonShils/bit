/** @flow */
// this class should also help with the performance of status/commit/export commands.
// common data of components-lists are cached.

import path from 'path';
import glob from 'glob';
import R from 'ramda';
import Version from '../../scope/models/version';
import Component from '../component';
import { BitId } from '../../bit-id';
import logger from '../../logger/logger';
import BitMap from '../bit-map/bit-map';
import Consumer from '../consumer';

export default class ComponentsList {
  consumer: Consumer;
  _fromFileSystem: Promise<string[]>;
  _fromBitMap: Object;
  _fromObjects: Promise<Object<Version>>;
  constructor(consumer: Consumer) {
    this.consumer = consumer;
    this.scope = consumer.scope;
  }

  /**
   * Check whether a model representation and file-system representation of the same component is the same.
   * The way how it is done is by converting the file-system representation of the component into
   * a Version object. Once this is done, we have two Version objects, and we can compare their hashes
   */
  async isComponentModified(componentFromModel: Version, componentFromFileSystem: Component): boolean {
    const { version } = await this.consumer.scope.sources.consumerComponentToVersion(
      { consumerComponent: componentFromFileSystem, consumer: this.consumer});

    version.log = componentFromModel.log; // ignore the log, it's irrelevant for the comparison
    // todo: once we know to auto-resolve dependencies, figure out if it should be part of the comparison. Currently, it is ignored.
    version.flattenedDependencies = componentFromModel.flattenedDependencies;

    return componentFromModel.hash().hash !== version.hash().hash;
  }


  /**
   * List all objects where the id is the object-id and the value is the Version object
   * It is useful when checking for modified components where the most important data is the Ref.
   */
  async getFromObjects(): Promise<Object<Version>> {
    if (!this._fromObjects) {
      const componentsObjects = await this.scope.objects.listComponents();
      const componentsVersionsP = {};
      const componentsVersions = {};
      componentsObjects.forEach((componentObjects) => {
        const latestVersionRef = componentObjects.versions[componentObjects.latest()];
        componentsVersionsP[componentObjects.id()] = this.scope.getObject(latestVersionRef.hash);
      });

      const allVersions = await Promise.all(R.values(componentsVersionsP));

      Object.keys(componentsVersionsP).forEach((key, i) => {
        componentsVersions[key] = allVersions[i];
      });
      this._fromObjects = componentsVersions;
    }
    return this._fromObjects;
  }

  /**
   * Components that are in the model (either, committed from a local scope or imported), and were
   * changed in the file system
   *
   * @return {Promise<string[]>}
   */
  async listModifiedComponents(): Promise<string[]> {
    const [objectComponents, fileSystemComponents] = await Promise
      .all([this.getFromObjects(), this.getFromFileSystem()]);

    const objFromFileSystem = fileSystemComponents.reduce((components, component) => {
      components[component.id.toString()] = component;
      return components;
    }, {});

    const modifiedComponents = [];
    Object.keys(objectComponents).forEach(async (id) => {
      const bitId = BitId.parse(id);
      const newId = bitId.changeScope(null);
      const componentFromFS = objFromFileSystem[newId.toString()];

      if (componentFromFS) {
        const isModified = await this.isComponentModified(objectComponents[id], componentFromFS);
        if (isModified) {
          modifiedComponents.push(newId.toString());
        }
      } else {
        logger.warn(`a component ${id} exists in the model but not on the file system`);
      }
    });
    return modifiedComponents;
  }

  async newAndModifiedComponents(): Promise<Component[]> {
    const [newComponents, modifiedComponents] = await Promise
      .all([this.listNewComponents(), this.listModifiedComponents()]);

    const componentsIds = [...newComponents, ...modifiedComponents];
    // todo: improve performance. Get the already loaded components
    const componentsP = componentsIds.map(id => {
      const bitId = BitId.parse(id);
      return this.consumer.loadComponent(bitId);
    });
    return Promise.all(componentsP);
  }

  async idsFromObjects(withScope: boolean = true): Promise<string[]> {
    const fromObjects = await this.getFromObjects();
    const ids = Object.keys(fromObjects);
    if (withScope) return ids;
    return ids.map((id) => {
      const bitId = BitId.parse(id);
      return bitId.changeScope(null).toString();
    });
  }

  /**
   * Components that are registered in bit.map but have never been committed
   *
   * @return {Promise.<string[]>}
   */
  async listNewComponents(): Promise<string[]> {
    const idsFromBitMap = await this.idsFromBitMap(false);
    const idsFromObjects = await this.idsFromObjects(false);
    const newComponents = [];
    idsFromBitMap.forEach((id) => {
      if (!idsFromObjects.includes(id)) {
        newComponents.push(id);
      }
    });
    return newComponents;
  }
  /**
   * New and modified components are commit pending
   *
   * @return {Promise<string[]>}
   */
  async listCommitPendingComponents(): Promise<string[]> {
    const [newComponents, modifiedComponents] = await Promise
      .all([this.listNewComponents(), this.listModifiedComponents()]);
    return [...newComponents, ...modifiedComponents];
  }

  /**
   * Components from the model where the scope is local are pending for export
   * @return {Promise<string[]>}
   */
  async listExportPendingComponents(): Promise<string[]> {
    const stagedComponents = [];
    const listFromObjects = await this.getFromObjects();
    Object.keys(listFromObjects).forEach((id) => {
      const bitId = BitId.parse(id);
      if (bitId.scope === this.scope.name) {
        bitId.scope = null;
        stagedComponents.push(bitId.toString());
      }
    });
    return stagedComponents;
  }

  // todo: replace with utils/glob it's already implemented there
  globP(pattern, options): Promise {
    return new Promise((resolve, reject) => {
      glob(pattern, options, (err, files) => {
        if (err) return reject(err);
        return resolve(files);
      });
    });
  }

  async idsFromBitMap(withScopeName = true) {
    const fromBitMap = await this.getFromBitMap();
    const ids = Object.keys(fromBitMap);
    if (withScopeName) return ids;
    return ids.map(id => BitId.parse(id).changeScope(null).toString());
  }

  async onFileSystemAndNotOnBitMap(): Promise<Component[]> {
    const { staticParts, dynamicParts } = this.consumer.dirStructure.componentsDirStructure;
    const asterisks = Array(dynamicParts.length).fill('*'); // e.g. ['*', '*', '*']
    const cwd = path.join(this.consumer.getPath(), ...staticParts);
    const idsFromBitMap = await this.idsFromBitMap();
    const idsFromBitMapWithoutScope = await this.idsFromBitMap(false);
    const files = await this.globP(path.join(...asterisks), { cwd });
    const componentsP = [];
    files.forEach((componentDynamicDirStr) => {
      const componentDynamicDir = componentDynamicDirStr.split(path.sep);
      const bitIdObj = {};
      // combine componentDynamicDir (e.g. ['array', 'sort']) and dynamicParts
      // (e.g. ['namespace', 'name']) into one object.
      // (e.g. { namespace: 'array', name: 'sort' } )
      componentDynamicDir.forEach((dir, idx) => {
        const key = dynamicParts[idx];
        bitIdObj[key] = dir;
      });
      const parsedId = new BitId(bitIdObj);
      if (!idsFromBitMap.includes(parsedId.toString())
        && !idsFromBitMapWithoutScope.includes(parsedId.toString())) {
        componentsP.push(this.consumer.loadComponent(parsedId));
      }
    });
    return Promise.all(componentsP);
  }

  /**
   * components that are on FS and not on bit.map
   */
  async listUntrackedComponents(): Promise<string[]> {
    const untrackedComponents = await this.onFileSystemAndNotOnBitMap();
    return untrackedComponents.map(component => component.id.toString());
  }

  /**
   * Finds all components that are saved in the file system.
   * Components might be stored in the default component directory and also might be outside
   * of that directory, in which case the bit.map is used to find them
   * @return {Promise<ConsumerComponent[]>}
   */
  async getFromFileSystem(): Promise<Component[]> {
    if (!this._fromFileSystem) {
      const idsFromBitMap = await this.idsFromBitMap();
      const parsedBitIds = idsFromBitMap.map((id) => BitId.parse(id));
      const registeredComponentsP = await this.consumer.loadComponents(parsedBitIds);
      const unRegisteredComponentsP = await this.onFileSystemAndNotOnBitMap();
      this._fromFileSystem = Promise.all([...registeredComponentsP, ...unRegisteredComponentsP]);
    }
    return this._fromFileSystem;
  }

  async getFromBitMap(): Object {
    if (!this._fromBitMap) {
      const bitMap = await BitMap.load(this.consumer.getPath());
      this._fromBitMap = bitMap.getAllComponents();
    }
    return this._fromBitMap;
  }
}
