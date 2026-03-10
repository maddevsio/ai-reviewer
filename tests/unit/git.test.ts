import { describe, it, expect } from 'vitest';
import { parseBitbucketUrl, parseGitLabUrl } from '../../src/utils/git';

describe('parseBitbucketUrl', () => {
  describe('HTTPS format', () => {
    it('parses workspace and repoSlug with .git suffix', () => {
      expect(parseBitbucketUrl('https://bitbucket.org/myworkspace/my-repo.git')).toEqual({
        workspace: 'myworkspace',
        repoSlug: 'my-repo',
      });
    });

    it('parses workspace and repoSlug without .git suffix', () => {
      expect(parseBitbucketUrl('https://bitbucket.org/myworkspace/my-repo')).toEqual({
        workspace: 'myworkspace',
        repoSlug: 'my-repo',
      });
    });

    it('handles hyphens and underscores in workspace and repo', () => {
      expect(parseBitbucketUrl('https://bitbucket.org/my_org/repo-name.git')).toEqual({
        workspace: 'my_org',
        repoSlug: 'repo-name',
      });
    });
  });

  describe('SSH format', () => {
    it('parses workspace and repoSlug with .git suffix', () => {
      expect(parseBitbucketUrl('git@bitbucket.org:myworkspace/my-repo.git')).toEqual({
        workspace: 'myworkspace',
        repoSlug: 'my-repo',
      });
    });

    it('parses workspace and repoSlug without .git suffix', () => {
      expect(parseBitbucketUrl('git@bitbucket.org:myworkspace/my-repo')).toEqual({
        workspace: 'myworkspace',
        repoSlug: 'my-repo',
      });
    });
  });

  describe('non-Bitbucket URLs', () => {
    it('returns null for a GitHub HTTPS URL', () => {
      expect(parseBitbucketUrl('https://github.com/owner/repo.git')).toBeNull();
    });

    it('returns null for a GitHub SSH URL', () => {
      expect(parseBitbucketUrl('git@github.com:owner/repo.git')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseBitbucketUrl('')).toBeNull();
    });

    it('returns null for a GitLab URL', () => {
      expect(parseBitbucketUrl('https://gitlab.com/owner/repo.git')).toBeNull();
    });
  });
});

describe('parseGitLabUrl', () => {
  describe('HTTPS format — gitlab.com', () => {
    it('parses namespace and project with .git suffix', () => {
      expect(parseGitLabUrl('https://gitlab.com/mygroup/my-project.git')).toEqual({
        namespace: 'mygroup',
        project: 'my-project',
      });
    });

    it('parses namespace and project without .git suffix', () => {
      expect(parseGitLabUrl('https://gitlab.com/mygroup/my-project')).toEqual({
        namespace: 'mygroup',
        project: 'my-project',
      });
    });

    it('handles hyphens and underscores in namespace and project', () => {
      expect(parseGitLabUrl('https://gitlab.com/my-group/my_project.git')).toEqual({
        namespace: 'my-group',
        project: 'my_project',
      });
    });
  });

  describe('SSH format', () => {
    it('parses namespace and project from gitlab.com SSH URL', () => {
      expect(parseGitLabUrl('git@gitlab.com:mygroup/my-project.git')).toEqual({
        namespace: 'mygroup',
        project: 'my-project',
      });
    });

    it('parses namespace and project without .git suffix', () => {
      expect(parseGitLabUrl('git@gitlab.com:mygroup/my-project')).toEqual({
        namespace: 'mygroup',
        project: 'my-project',
      });
    });
  });

  describe('self-hosted', () => {
    it('parses HTTPS self-hosted GitLab URL', () => {
      expect(parseGitLabUrl('https://gitlab.example.com/mygroup/my-project.git')).toEqual({
        namespace: 'mygroup',
        project: 'my-project',
      });
    });

    it('parses SSH self-hosted GitLab URL', () => {
      expect(parseGitLabUrl('git@gitlab.example.com:mygroup/my-project.git')).toEqual({
        namespace: 'mygroup',
        project: 'my-project',
      });
    });
  });

  describe('non-GitLab URLs', () => {
    it('returns null for a GitHub URL', () => {
      expect(parseGitLabUrl('https://github.com/owner/repo.git')).toBeNull();
    });

    it('returns null for a Bitbucket URL', () => {
      expect(parseGitLabUrl('https://bitbucket.org/workspace/repo.git')).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseGitLabUrl('')).toBeNull();
    });
  });
});
