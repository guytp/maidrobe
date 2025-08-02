using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Domain
{
    public interface IRepository<T> where T : BaseDataObject
    {
        Task<T> GetByIdAsync(Guid id);
        Task<T> CreateAsync(T entity);
        Task<T> UpdateAsync(T entity);
        Task InsertManyAsync(IEnumerable<T> entities);
        Task DeleteAsync(Guid id);
        /// <summary>
        /// Partially updates an entity with specified updates and property names
        /// </summary>
        /// <param name="id">The unique identifier of the entity to update</param>
        /// <param name="updates">An object containing the fields to update</param>
        /// <param name="propertyNames">Array of property names to update. If empty, all properties from the updates object will be considered</param>
        /// <returns>A task representing the asynchronous patch operation</returns>
        Task PatchAsync(Guid id, object updates, params string[] propertyNames);
    }
}