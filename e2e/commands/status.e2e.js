import { expect } from 'chai';
import Helper from '../e2e-helper';

describe('bit status command', function () {
  this.timeout(0);
  const helper = new Helper();
  after(() => {
    helper.destroyEnv();
  });
  describe('when no components created', () => {
    before(() => {
      helper.cleanEnv();
      helper.runCmd('bit init');
    });
    it('should indicate that there are no components', () => {
      const output = helper.runCmd('bit status');
      expect(output.includes('There are no untracked components')).to.be.true;
      expect(output.includes('There are no new components')).to.be.true;
      expect(output.includes('There are no modified components')).to.be.true;
      expect(output.includes('There are no staged components')).to.be.true;
    });
  });
  describe.skip('when a component is created in the configured components directory but not added', () => {
    it('should display that component as an untracked component', () => {
      // todo: implement
    });
  });
  describe('when a component is created and added but not committed', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      output = helper.runCmd('bit status');
    });
    it('should display that component as a new component', () => {
      expect(output.includes('There are no new components')).to.be.false;

      expect(output.includes('New Components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as untracked', () => {
      expect(output.includes('There are no untracked components')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('There are no modified components')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('There are no staged components')).to.be.true;
    });
  });
  describe('when a component is created, added and committed', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      output = helper.runCmd('bit status');
    });
    it('should display that component as a staged component', () => {
      expect(output.includes('There are no staged components')).to.be.false;

      expect(output.includes('Staged Components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as untracked', () => {
      expect(output.includes('There are no untracked components')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('There are no modified components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('There are no new components')).to.be.true;
    });
  });
  describe('when a component is modified after commit', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      // modify the component
      helper.createComponentBarFoo("module.exports = function foo() { return 'got foo v2'; };");
      output = helper.runCmd('bit status');
    });
    it('should display that component as a modified component', () => {
      expect(output.includes('There are no modified components')).to.be.false;

      expect(output.includes('Modified Components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should display that component as a staged component (?)', () => {
      // todo: currently, it shows the component also as staged, because practically, it is export pending as well.
      // are we good with it?
      expect(output.includes('There are no staged components')).to.be.false;

      expect(output.includes('Staged Components')).to.be.true;
      expect(output.includes('bar/foo')).to.be.true;
    });
    it('should not display that component as untracked', () => {
      expect(output.includes('There are no untracked components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('There are no new components')).to.be.true;
    });
  });
  describe('when a component is created, added, committed and exported', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportComponent('bar/foo');
      output = helper.runCmd('bit status');
    });
    it('should not display that component as untracked', () => {
      expect(output.includes('There are no untracked components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('There are no new components')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('There are no modified components')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('There are no staged components')).to.be.true;
    });
  });
  describe('when a component is imported', () => {
    let output;
    before(() => {
      helper.reInitLocalScope();
      helper.createComponentBarFoo();
      helper.addComponentBarFoo();
      helper.commitComponentBarFoo();
      helper.reInitRemoteScope();
      helper.addRemoteScope();
      helper.exportComponent('bar/foo');
      helper.reInitLocalScope();
      helper.addRemoteScope();
      helper.importComponent('bar/foo');
      output = helper.runCmd('bit status');
    });
    it('should not display that component as untracked', () => {
      expect(output.includes('There are no untracked components')).to.be.true;
    });
    it('should not display that component as new', () => {
      expect(output.includes('There are no new components')).to.be.true;
    });
    it('should not display that component as modified', () => {
      expect(output.includes('There are no modified components')).to.be.true;
    });
    it('should not display that component as staged', () => {
      expect(output.includes('There are no staged components')).to.be.true;
    });
  });
});
