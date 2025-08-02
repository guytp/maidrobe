using Domain;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Infrastructure.Data
{
    /// <summary>
    /// MongoDB-specific repository interface that extends the base repository with MongoDB operations
    /// </summary>
    /// <typeparam name="T">The entity type, must inherit from BaseDataObject</typeparam>
    public interface IMongoRepository<T> : IRepository<T> where T : BaseDataObject
    {
        /// <summary>
        /// Partially updates an entity by applying only the specified field updates
        /// </summary>
        /// <param name="id">The unique identifier of the entity to update</param>
        /// <param name="updates">An object containing the fields to update. Use anonymous objects with nameof() for type-safe field selection</param>
        /// <returns>A task representing the asynchronous patch operation</returns>
        Task PatchAsync(System.Guid id, object updates);
    }
}