import mongoose from 'mongoose';
import { dbConfig } from '../config';
import { MemoryCache } from '../types';
import { LeetCodeUser, GitHubUser, CSDNUser } from '../models/mongodb.models';
import { ILeetCodeUser, IGitHubUser, ICSDNUser } from '../types';

// 内存缓存，作为MongoDB不可用时的备用
const memoryCache: MemoryCache = {
  leetcode: {},
  github: {},
  csdn: {}
};

// 连接MongoDB数据库
export const connectDB = async (): Promise<boolean> => {
  try {
    // 检查是否有MongoDB URI
    if (!dbConfig.mongoURI) {
      console.error("MongoDB URI 未设置，使用内存模式");
      return false;
    }

    const conn = await mongoose.connect(dbConfig.mongoURI, dbConfig.options);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return true;
  } catch (error: any) {
    console.error(`MongoDB Connection Error: ${error.message}`);
    return false;
  }
};

// 获取LeetCode用户数据
export const getLeetCodeUserData = async (username: string, cacheTimeInSeconds: number): Promise<{
  userData: ILeetCodeUser | null;
  needsFetch: boolean;
  error?: Error;
}> => {
  try {
    // 检查MongoDB连接状态
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (!isMongoConnected) {
      await connectDB();
    }

    let userData: ILeetCodeUser | null = null;
    let needsFetch = true;

    if (isMongoConnected) {
      // 从数据库获取数据
      userData = await LeetCodeUser.findOne({ username });

      // 检查数据是否需要更新（超过24小时）
      if (userData) {
        const lastUpdated = new Date(userData.lastUpdated);
        const now = new Date();
        const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / 1000;

        if (hoursSinceUpdate < cacheTimeInSeconds) {
          needsFetch = false;
        }
      }
    } else {
      // 使用内存缓存
      userData = memoryCache.leetcode[username] || null;

      if (userData) {
        const lastUpdated = new Date(userData.lastUpdated);
        const now = new Date();
        const hoursSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60);

        if (hoursSinceUpdate < 24) {
          needsFetch = false;
        }
      }
    }

    return { userData, needsFetch };
  } catch (error: any) {
    console.error(`获取用户数据失败: ${error.message}`);
    return { userData: null, needsFetch: true, error: error as Error };
  }
};

// 更新用户数据
export const updateUserData = async (username: string, userData: ILeetCodeUser, cacheTimeInSeconds: number): Promise<boolean> => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;

    if (isMongoConnected) {
      // 更新数据库，设置TTL索引
      await LeetCodeUser.findOneAndUpdate({ username }, {...userData, lastUpdated: new Date()}, {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
        // 设置TTL索引
        expires: cacheTimeInSeconds
      });
    } else {
      // 更新内存缓存
      memoryCache.leetcode[username] = userData;
    }
    return true;
  } catch (error: any) {
    console.error(`更新用户数据失败: ${error.message}`);
    return false;
  }
};

// 获取GitHub用户数据
export const getGitHubUserData = async (username: string): Promise<{
  userData: IGitHubUser | null;
  error?: Error;
}> => {
  try {
    // 检查MongoDB连接状态
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (!isMongoConnected) {
      await connectDB();
    }

    let userData: IGitHubUser | null = null;

    if (isMongoConnected) {
      // 从数据库获取数据
      userData = await GitHubUser.findOne({ username });
    } else {
      // 使用内存缓存
      const cachedData = memoryCache.github[username];
      if (cachedData) {
        userData = {
          ...cachedData,
          // 确保 avatarUpdatedAt 有默认值
          avatarUpdatedAt: cachedData.avatarUpdatedAt || new Date()
        };
      } else {
        userData = null;
      }
    }

    return { userData };
  } catch (error: any) {
    console.error(`获取GitHub用户数据失败: ${error.message}`);
    return { userData: null, error: error as Error };
  }
};

// 更新GitHub用户数据
export const updateGitHubUserData = async (username: string, avatarUrl?: string): Promise<boolean> => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    const now = new Date();

    const updateData: any = {
      $inc: { visitCount: 1 },
      $set: { lastVisited: now, lastUpdated: now }
    };
    
    // 如果提供了头像URL，则更新头像和头像更新时间
    if (avatarUrl) {
      updateData.$set.avatarUrl = avatarUrl;
      updateData.$set.avatarUpdatedAt = now;
    }

    if (isMongoConnected) {
      // 更新数据库
      await GitHubUser.findOneAndUpdate({ username }, updateData, {
        upsert: true,
        new: true,
      });
    } else {
      // 更新内存缓存
      if (!memoryCache.github[username]) {
        memoryCache.github[username] = {
          username,
          visitCount: 0,
          lastVisited: now,
          lastUpdated: now,
          avatarUpdatedAt: now
        };
      }
      memoryCache.github[username].visitCount += 1;
      memoryCache.github[username].lastVisited = now;
      memoryCache.github[username].lastUpdated = now;
      
      // 如果提供了头像URL，也更新缓存中的头像URL和头像更新时间
      if (avatarUrl) {
        memoryCache.github[username].avatarUrl = avatarUrl;
        memoryCache.github[username].avatarUpdatedAt = now;
      }
    }
    return true;
  } catch (error: any) {
    console.error(`更新GitHub用户数据失败: ${error.message}`);
    return false;
  }
};

// 获取CSDN用户数据
export const getCSDNUserData = async (userId: string, cacheTimeInSeconds: number): Promise<{ userData: ICSDNUser | null; needsFetch: boolean; error?: Error; }> => {
  try {
    // 检查MongoDB连接状态
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (!isMongoConnected) {
      await connectDB();
    }

    let userData: ICSDNUser | null = null;
    let needsFetch = true;

    if (isMongoConnected) {
      // 从数据库获取数据
      userData = await CSDNUser.findOne({ userId });

      // 检查数据是否需要更新（超过指定的缓存时间）
      if (userData) {
        const lastUpdated = new Date(userData.lastUpdated);
        const now = new Date();
        const secondsSinceUpdate = (now.getTime() - lastUpdated.getTime()) / 1000;

        if (secondsSinceUpdate < cacheTimeInSeconds) {
          needsFetch = false;
        }
      }
    }

    return { userData, needsFetch };
  } catch (error: any) {
    console.error(`获取用户数据失败: ${error.message}`);
    return { userData: null, needsFetch: true, error: error as Error };
  }
};

// 更新CSDN用户数据
export const updateCSDNUserData = async (userId: string, userData: Partial<ICSDNUser>): Promise<boolean> => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;

    // 确保userData包含userId字段
    const updatedData = {
      ...userData,
      userId
    };

    if (isMongoConnected) {
      // 更新数据库
      await CSDNUser.findOneAndUpdate({ userId }, updatedData, {
        upsert: true,
        new: true,
      });
    } else {
      // 更新内存缓存
      if (!memoryCache.csdn[userId]) {
        memoryCache.csdn[userId] = {
          userId,
          username: updatedData.username || userId,
          articleCount: 0,
          followers: 0,
          likes: 0,
          views: 0,
          comments: 0,
          points: 0,
          visitCount: 0,
          lastUpdated: new Date()
        };
      }
      
      // 合并更新的数据
      memoryCache.csdn[userId] = {
        ...memoryCache.csdn[userId],
        ...updatedData,
        lastUpdated: new Date()
      };
    }
    
    return true;
  } catch (error: any) {
    console.error(`更新CSDN用户数据失败: ${error.message}`);
    return false;
  }
}; 