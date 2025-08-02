using Domain;
using MongoDB.Driver;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    public class BaseMongoRepository<T> : IMongoRepository<T> where T : BaseDataObject
    {
        private readonly IMongoDatabase _database;
        private readonly IMongoCollection<T> _collection;

        public BaseMongoRepository(IMongoDatabase database)
        {
            _database = database;
            _collection = _database.GetCollection<T>(typeof(T).Name);
        }

        // IRepository<T> implementations using Guid
        public async Task<T> GetByIdAsync(Guid id)
        {
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            return await _collection.Find(filter).FirstOrDefaultAsync();
        }

        public async Task<T> CreateAsync(T entity)
        {
            entity.DateCreated = DateTimeOffset.UtcNow;
            entity.DateUpdated = DateTimeOffset.UtcNow;
            await _collection.InsertOneAsync(entity);
            return entity;
        }

        public async Task InsertAsync(IEnumerable<T> entities)
        {
            var entitiesList = entities.ToList();
            foreach (var entity in entitiesList)
            {
                entity.DateCreated = DateTimeOffset.UtcNow;
                entity.DateUpdated = DateTimeOffset.UtcNow;
            }
            await _collection.InsertManyAsync(entitiesList);
        }

        public async Task<T> UpdateAsync(T entity)
        {
            entity.DateUpdated = DateTimeOffset.UtcNow;
            var filter = Builders<T>.Filter.Eq(x => x.Id, entity.Id);
            await _collection.ReplaceOneAsync(filter, entity);
            return entity;
        }

        public async Task DeleteAsync(Guid id)
        {
            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            await _collection.DeleteOneAsync(filter);
        }

        public async Task PatchAsync(Guid id, string[] propertyNames)
        {
            // For the string[] version, we need to get the entity first to extract property values
            var entity = await GetByIdAsync(id);
            if (entity == null) return;

            var filter = Builders<T>.Filter.Eq(x => x.Id, id);
            var updateDefinition = Builders<T>.Update.Set(x => x.DateUpdated, DateTimeOffset.UtcNow);
            
            var entityType = typeof(T);
            foreach (var propertyName in propertyNames)
            {
                var property = entityType.GetProperty(propertyName);
                if (property != null)
                {
                    var value = property.GetValue(entity);
                    updateDefinition = updateDefinition.Set(propertyName, value);
                }
            }
            
            await _collection.UpdateOneAsync(filter, updateDefinition);
        }

        // MongoDB-specific overloads using string IDs
        public async Task<T?> GetByIdAsync(string id)
        {
            if (Guid.TryParse(id, out var guidId))
            {
                return await GetByIdAsync(guidId);
            }
            return null;
        }

        public async Task InsertAsync(T entity)
        {
            entity.DateCreated = DateTimeOffset.UtcNow;
            entity.DateUpdated = DateTimeOffset.UtcNow;
            await _collection.InsertOneAsync(entity);
        }

        Task<T> IMongoRepository<T>.UpdateAsync(T entity)
        {
            return UpdateAsync(entity);
        }

        public async Task PatchAsync(string id, object updates)
        {
            if (Guid.TryParse(id, out var guidId))
            {
                var filter = Builders<T>.Filter.Eq(x => x.Id, guidId);
                var updateDefinition = Builders<T>.Update.Set(x => x.DateUpdated, DateTimeOffset.UtcNow);
                
                foreach (var property in updates.GetType().GetProperties())
                {
                    var value = property.GetValue(updates);
                    if (value != null)
                    {
                        updateDefinition = updateDefinition.Set(property.Name, value);
                    }
                }
                
                await _collection.UpdateOneAsync(filter, updateDefinition);
            }
        }

        public async Task DeleteAsync(string id)
        {
            if (Guid.TryParse(id, out var guidId))
            {
                await DeleteAsync(guidId);
            }
        }
    }
}